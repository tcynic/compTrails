/**
 * FMV API Integration for Convex Backend
 * 
 * This action handles fetching Fair Market Value data from multiple providers
 * with fallback support, rate limiting, and caching.
 */

import { action } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { api } from '../_generated/api';

export interface FMVProvider {
  name: string;
  requiresAuth: boolean;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
}

export interface FMVResult {
  success: boolean;
  fmv?: number;
  source: string;
  confidence: number;
  error?: string;
  rateLimited?: boolean;
  cached?: boolean;
  timestamp: number;
}

// Provider configurations
const PROVIDERS: Record<string, FMVProvider> = {
  yahoo: {
    name: 'Yahoo Finance',
    requiresAuth: false,
    rateLimit: {
      requestsPerMinute: 100,
      requestsPerDay: 2000,
    },
  },
  alphavantage: {
    name: 'Alpha Vantage',
    requiresAuth: true,
    rateLimit: {
      requestsPerMinute: 5,
      requestsPerDay: 500,
    },
  },
  finnhub: {
    name: 'Finnhub',
    requiresAuth: true,
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerDay: 1000,
    },
  },
};

/**
 * Main action to fetch FMV data with fallback support
 */
export const fetchFMV = action({
  args: {
    ticker: v.string(),
    provider: v.optional(v.string()),
    useCache: v.optional(v.boolean()),
    forceFresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<FMVResult> => {
    const ticker = args.ticker.toUpperCase();
    const provider = args.provider || process.env.FMV_DEFAULT_PROVIDER || 'yahoo';
    const useCache = args.useCache ?? true;
    const forceFresh = args.forceFresh ?? false;

    try {
      // Check cache first unless forced fresh
      if (useCache && !forceFresh) {
        const cached = await checkCache(ctx, ticker);
        if (cached) {
          return {
            ...cached,
            cached: true,
          };
        }
      }

      // Check rate limit
      const rateLimitCheck = await checkRateLimit(ctx, provider);
      if (!rateLimitCheck.allowed) {
        // If rate limited, try fallback providers
        if (process.env.FMV_ENABLE_FALLBACK === 'true') {
          return await fetchWithFallback(ctx, ticker, [provider]);
        }
        
        return {
          success: false,
          source: provider,
          confidence: 0,
          error: 'Rate limit exceeded',
          rateLimited: true,
          timestamp: Date.now(),
        };
      }

      // Fetch from primary provider
      const startTime = Date.now();
      let result: FMVResult;
      
      switch (provider) {
        case 'yahoo':
          result = await fetchFromYahoo(ticker);
          break;
        case 'alphavantage':
          result = await fetchFromAlphaVantage(ticker);
          break;
        case 'finnhub':
          result = await fetchFromFinnhub(ticker);
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }

      const responseTime = Date.now() - startTime;
      
      // Track the API call
      await trackApiCall(ctx, provider, result.success, responseTime);

      // Cache successful results
      if (result.success && result.fmv) {
        await cacheResult(ctx, ticker, result);
      }

      return result;

    } catch (error) {
      console.error(`Error fetching FMV for ${ticker} from ${provider}:`, error);
      
      // Try fallback if enabled
      if (process.env.FMV_ENABLE_FALLBACK === 'true') {
        return await fetchWithFallback(ctx, ticker, [provider]);
      }

      return {
        success: false,
        source: provider,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  },
});

/**
 * Fetch from Yahoo Finance (no auth required)
 */
async function fetchFromYahoo(ticker: string): Promise<FMVResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CompTrails/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.chart?.error) {
      throw new Error(data.chart.error.description || 'Yahoo Finance API error');
    }

    const result = data.chart?.result?.[0];
    if (!result || !result.meta || typeof result.meta.regularMarketPrice !== 'number') {
      throw new Error('Invalid response structure from Yahoo Finance');
    }

    const price = result.meta.regularMarketPrice;
    const marketState = result.meta.marketState;

    // Adjust confidence based on market state
    let confidence = 0.85;
    if (marketState === 'REGULAR') {
      confidence = 0.90;
    } else if (marketState === 'CLOSED') {
      confidence = 0.80;
    }

    return {
      success: true,
      fmv: price,
      source: 'yahoo',
      confidence,
      timestamp: Date.now(),
    };

  } catch (error) {
    throw new Error(`Yahoo Finance error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch from Alpha Vantage (requires API key)
 */
async function fetchFromAlphaVantage(ticker: string): Promise<FMVResult> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error('Alpha Vantage API key not configured');
  }

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }

    if (data['Note']) {
      // Rate limit message
      return {
        success: false,
        source: 'alphavantage',
        confidence: 0,
        error: 'API rate limit exceeded',
        rateLimited: true,
        timestamp: Date.now(),
      };
    }

    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) {
      throw new Error('Invalid response from Alpha Vantage');
    }

    const price = parseFloat(quote['05. price']);
    
    return {
      success: true,
      fmv: price,
      source: 'alphavantage',
      confidence: 0.95, // High confidence for premium API
      timestamp: Date.now(),
    };

  } catch (error) {
    throw new Error(`Alpha Vantage error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch from Finnhub (requires API key)
 */
async function fetchFromFinnhub(ticker: string): Promise<FMVResult> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error('Finnhub API key not configured');
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (!data.c || data.c <= 0) {
      throw new Error('Invalid price data from Finnhub');
    }

    return {
      success: true,
      fmv: data.c, // Current price
      source: 'finnhub',
      confidence: 0.95, // High confidence for premium API
      timestamp: Date.now(),
    };

  } catch (error) {
    throw new Error(`Finnhub error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Try fallback providers
 */
async function fetchWithFallback(
  ctx: any,
  ticker: string,
  failedProviders: string[]
): Promise<FMVResult> {
  const allProviders = ['yahoo', 'alphavantage', 'finnhub'];
  const availableProviders = allProviders.filter(p => !failedProviders.includes(p));

  for (const provider of availableProviders) {
    try {
      console.log(`Trying fallback provider: ${provider}`);
      
      const result = await ctx.runAction(internal.actions.fmvApi.fetchFMV, {
        ticker,
        provider,
        useCache: true,
        forceFresh: false,
      });

      if (result.success) {
        return result;
      }

    } catch (error) {
      console.error(`Fallback provider ${provider} failed:`, error);
      continue;
    }
  }

  return {
    success: false,
    source: 'none',
    confidence: 0,
    error: 'All providers failed',
    timestamp: Date.now(),
  };
}

/**
 * Check cache for FMV data
 */
async function checkCache(ctx: any, ticker: string): Promise<FMVResult | null> {
  try {
    const cached = await ctx.runMutation(internal.lib.fmvCache.getCachedFMV, { ticker });
    return cached;
  } catch (error) {
    console.error('Error checking cache:', error);
    return null;
  }
}

/**
 * Cache FMV result
 */
async function cacheResult(ctx: any, ticker: string, result: FMVResult): Promise<void> {
  try {
    await ctx.runMutation(internal.lib.fmvCache.cacheFMV, {
      ticker,
      result: {
        fmv: result.fmv!,
        source: result.source,
        confidence: result.confidence,
        timestamp: result.timestamp,
      },
    });
  } catch (error) {
    console.error('Error caching result:', error);
  }
}

/**
 * Check rate limit for provider
 */
async function checkRateLimit(ctx: any, provider: string): Promise<{ allowed: boolean; reason?: string; resetAt?: number }> {
  try {
    const result = await ctx.runMutation(internal.lib.fmvRateLimit.checkRateLimit, { provider });
    return result;
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // Default to allowing if rate limit check fails
    return { allowed: true };
  }
}

/**
 * Track API call for rate limiting
 */
async function trackApiCall(ctx: any, provider: string, success: boolean = true, responseTime?: number): Promise<void> {
  try {
    await ctx.runMutation(internal.lib.fmvRateLimit.trackApiCall, {
      provider,
      success,
      responseTime,
    });
  } catch (error) {
    console.error('Error tracking API call:', error);
  }
}

/**
 * Batch fetch FMV for multiple tickers
 */
export const batchFetchFMV = action({
  args: {
    tickers: v.array(v.string()),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const results: Record<string, FMVResult> = {};
    
    // Process in parallel with concurrency limit
    const batchSize = 5;
    for (let i = 0; i < args.tickers.length; i += batchSize) {
      const batch = args.tickers.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(ticker => 
          ctx.runAction(internal.actions.fmvApi.fetchFMV, {
            ticker,
            provider: args.provider,
          }).catch(error => ({
            success: false,
            source: args.provider || 'unknown',
            confidence: 0,
            error: error.message,
            timestamp: Date.now(),
          }))
        )
      );
      
      batch.forEach((ticker, index) => {
        results[ticker] = batchResults[index];
      });
    }
    
    return results;
  },
});