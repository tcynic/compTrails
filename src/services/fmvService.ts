import type { 
  FMVDataSource 
} from '@/lib/db/types';

export interface FMVProvider {
  name: string;
  baseUrl: string;
  requiresAuth: boolean;
  rateLimit: {
    requestsPerMinute: number;
    requestsPerDay: number;
  };
  supportedCurrencies: string[];
}

export interface FMVUpdateResult {
  success: boolean;
  fmv?: number;
  source: string;
  confidence: number;
  error?: string;
  rateLimited?: boolean;
}

export class FMVService {
  private static readonly PROVIDERS: Record<string, FMVProvider> = {
    alphavantage: {
      name: 'Alpha Vantage',
      baseUrl: 'https://www.alphavantage.co/query',
      requiresAuth: true,
      rateLimit: {
        requestsPerMinute: 5,
        requestsPerDay: 500,
      },
      supportedCurrencies: ['USD'],
    },
    finnhub: {
      name: 'Finnhub',
      baseUrl: 'https://finnhub.io/api/v1',
      requiresAuth: true,
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerDay: 1000,
      },
      supportedCurrencies: ['USD'],
    },
    yahoo: {
      name: 'Yahoo Finance (Unofficial)',
      baseUrl: 'https://query1.finance.yahoo.com/v8/finance/chart',
      requiresAuth: false,
      rateLimit: {
        requestsPerMinute: 100,
        requestsPerDay: 2000,
      },
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD'],
    },
  };

  private static readonly DEFAULT_PROVIDER = 'yahoo';
  private static requestCounts: Record<string, { count: number; resetTime: number }> = {};

  /**
   * Get current Fair Market Value for a stock ticker
   */
  static async getFMV(
    ticker: string,
    provider: string = this.DEFAULT_PROVIDER,
    apiKey?: string
  ): Promise<FMVUpdateResult> {
    try {
      // Check rate limits
      const rateLimitCheck = this.checkRateLimit(provider);
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          source: provider,
          confidence: 0,
          error: 'Rate limit exceeded',
          rateLimited: true,
        };
      }

      const providerConfig = this.PROVIDERS[provider];
      if (!providerConfig) {
        throw new Error(`Unknown FMV provider: ${provider}`);
      }

      let result: FMVUpdateResult;

      switch (provider) {
        case 'alphavantage':
          result = await this.fetchFromAlphaVantage(ticker, apiKey);
          break;
        case 'finnhub':
          result = await this.fetchFromFinnhub(ticker, apiKey);
          break;
        case 'yahoo':
          result = await this.fetchFromYahoo(ticker);
          break;
        default:
          throw new Error(`Provider ${provider} not implemented`);
      }

      // Track request for rate limiting
      this.trackRequest(provider);

      return result;

    } catch (error) {
      console.error(`Error fetching FMV for ${ticker} from ${provider}:`, error);
      
      return {
        success: false,
        source: provider,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch FMV from Alpha Vantage
   */
  private static async fetchFromAlphaVantage(
    ticker: string,
    apiKey?: string
  ): Promise<FMVUpdateResult> {
    if (!apiKey) {
      throw new Error('Alpha Vantage API key required');
    }

    const url = `${this.PROVIDERS.alphavantage.baseUrl}?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data['Error Message']) {
      throw new Error(`Alpha Vantage API error: ${data['Error Message']}`);
    }

    if (data['Note']) {
      // Rate limit hit
      return {
        success: false,
        source: 'alphavantage',
        confidence: 0,
        error: 'API rate limit exceeded',
        rateLimited: true,
      };
    }

    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) {
      throw new Error('Invalid response from Alpha Vantage');
    }

    const price = parseFloat(quote['05. price']);
    // const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

    return {
      success: true,
      fmv: price,
      source: 'alphavantage',
      confidence: 0.95, // High confidence for paid API
    };
  }

  /**
   * Fetch FMV from Finnhub
   */
  private static async fetchFromFinnhub(
    ticker: string,
    apiKey?: string
  ): Promise<FMVUpdateResult> {
    if (!apiKey) {
      throw new Error('Finnhub API key required');
    }

    const url = `${this.PROVIDERS.finnhub.baseUrl}/quote?symbol=${ticker}&token=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      throw new Error(`Finnhub API error: ${data.error}`);
    }

    if (!data.c || data.c <= 0) {
      throw new Error('Invalid price data from Finnhub');
    }

    return {
      success: true,
      fmv: data.c, // Current price
      source: 'finnhub',
      confidence: 0.95, // High confidence for paid API
    };
  }

  /**
   * Fetch FMV from Yahoo Finance (unofficial API)
   */
  private static async fetchFromYahoo(ticker: string): Promise<FMVUpdateResult> {
    const url = `${this.PROVIDERS.yahoo.baseUrl}/${ticker}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.chart?.error) {
      throw new Error(`Yahoo Finance API error: ${data.chart.error.description}`);
    }

    const result = data.chart?.result?.[0];
    if (!result || !result.meta || !result.meta.regularMarketPrice) {
      throw new Error('Invalid response from Yahoo Finance');
    }

    const price = result.meta.regularMarketPrice;
    const marketState = result.meta.marketState; // 'REGULAR', 'CLOSED', 'PRE', 'POST'

    // Adjust confidence based on market state
    let confidence = 0.85; // Base confidence for free API
    if (marketState === 'REGULAR') {
      confidence = 0.90; // Higher confidence during market hours
    } else if (marketState === 'CLOSED') {
      confidence = 0.80; // Lower confidence when market is closed
    }

    return {
      success: true,
      fmv: price,
      source: 'yahoo',
      confidence,
    };
  }

  /**
   * Get FMV with fallback providers
   */
  static async getFMVWithFallback(
    ticker: string,
    providers: string[] = ['yahoo', 'alphavantage', 'finnhub'],
    apiKeys: Record<string, string> = {}
  ): Promise<FMVUpdateResult> {
    for (const provider of providers) {
      try {
        const result = await this.getFMV(ticker, provider, apiKeys[provider]);
        
        if (result.success) {
          return result;
        }
        
        // If rate limited, try next provider
        if (result.rateLimited) {
          console.log(`Rate limited on ${provider}, trying next provider...`);
          continue;
        }
        
        // For other errors, log and try next provider
        console.warn(`Failed to get FMV from ${provider}: ${result.error}`);
        
      } catch (error) {
        console.error(`Error with provider ${provider}:`, error);
      }
    }

    return {
      success: false,
      source: 'none',
      confidence: 0,
      error: 'All providers failed',
    };
  }

  /**
   * Validate ticker symbol format
   */
  static validateTicker(ticker: string): boolean {
    // Basic ticker validation - alphanumeric, 1-5 characters, optional exchange suffix
    const tickerRegex = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;
    return tickerRegex.test(ticker.toUpperCase());
  }

  /**
   * Normalize ticker symbol (add exchange suffix if needed)
   */
  static normalizeTicker(ticker: string, exchange?: string): string {
    const normalized = ticker.toUpperCase();
    
    if (exchange && !normalized.includes('.')) {
      // Add exchange suffix for international stocks
      return `${normalized}.${exchange.toUpperCase()}`;
    }
    
    return normalized;
  }

  /**
   * Calculate confidence score based on data freshness and source
   */
  static calculateConfidence(
    source: FMVDataSource,
    provider: string,
    dataAge: number // in minutes
  ): number {
    let baseConfidence = 0.5;

    // Base confidence by source type
    switch (source) {
      case 'api':
        baseConfidence = 0.8;
        break;
      case 'manual':
        baseConfidence = 1.0; // User input is trusted
        break;
      case 'estimated':
        baseConfidence = 0.3;
        break;
    }

    // Adjust for provider quality
    if (provider === 'alphavantage' || provider === 'finnhub') {
      baseConfidence += 0.1; // Premium APIs get bonus
    }

    // Penalize old data
    const ageHours = dataAge / 60;
    if (ageHours > 24) {
      baseConfidence *= 0.8; // 20% penalty for data older than 1 day
    } else if (ageHours > 1) {
      baseConfidence *= 0.95; // 5% penalty for data older than 1 hour
    }

    return Math.min(1.0, Math.max(0.0, baseConfidence));
  }

  /**
   * Check if we should update FMV based on last update time and confidence
   */
  static shouldUpdateFMV(
    lastUpdate: Date,
    lastConfidence: number,
    forceUpdate: boolean = false
  ): boolean {
    if (forceUpdate) {
      return true;
    }

    const now = new Date();
    const timeSinceUpdate = now.getTime() - lastUpdate.getTime();
    const hoursSinceUpdate = timeSinceUpdate / (1000 * 60 * 60);

    // Always update if data is more than 24 hours old
    if (hoursSinceUpdate > 24) {
      return true;
    }

    // Update more frequently for low confidence data
    if (lastConfidence < 0.7 && hoursSinceUpdate > 4) {
      return true;
    }

    // Update during market hours (9 AM - 4 PM EST)
    const hour = now.getHours();
    const isMarketHours = hour >= 9 && hour <= 16;
    
    if (isMarketHours && hoursSinceUpdate > 1) {
      return true;
    }

    return false;
  }

  /**
   * Rate limiting
   */
  private static checkRateLimit(provider: string): { allowed: boolean; resetTime?: number } {
    const providerConfig = this.PROVIDERS[provider];
    if (!providerConfig) {
      return { allowed: false };
    }

    const now = Date.now();
    const requestData = this.requestCounts[provider];

    if (!requestData) {
      return { allowed: true };
    }

    // Reset counter every minute
    if (now > requestData.resetTime) {
      delete this.requestCounts[provider];
      return { allowed: true };
    }

    return {
      allowed: requestData.count < providerConfig.rateLimit.requestsPerMinute,
      resetTime: requestData.resetTime,
    };
  }

  private static trackRequest(provider: string): void {
    const now = Date.now();
    const resetTime = now + (60 * 1000); // Reset in 1 minute

    if (!this.requestCounts[provider]) {
      this.requestCounts[provider] = { count: 1, resetTime };
    } else {
      this.requestCounts[provider].count++;
    }
  }

  /**
   * Get supported currencies for a provider
   */
  static getSupportedCurrencies(provider: string): string[] {
    return this.PROVIDERS[provider]?.supportedCurrencies || [];
  }

  /**
   * Get all available providers
   */
  static getAvailableProviders(): FMVProvider[] {
    return Object.entries(this.PROVIDERS).map(([key, config]) => ({
      ...config,
      name: key,
    }));
  }

  /**
   * Estimate FMV for private companies (placeholder implementation)
   */
  static estimatePrivateCompanyFMV(
    companyName: string,
    lastKnownValuation?: number,
    lastKnownDate?: Date,
    ..._args: any[]
  ): FMVUpdateResult {
    // This is a placeholder for private company valuation
    // In a real implementation, this would use more sophisticated methods
    
    if (lastKnownValuation && lastKnownDate) {
      const monthsSinceUpdate = (Date.now() - lastKnownDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      
      // Simple appreciation model (very basic)
      const annualGrowthRate = 0.10; // Assume 10% annual growth
      const growthFactor = Math.pow(1 + annualGrowthRate, monthsSinceUpdate / 12);
      const estimatedValue = lastKnownValuation * growthFactor;

      return {
        success: true,
        fmv: estimatedValue,
        source: 'estimated',
        confidence: Math.max(0.1, 0.7 - (monthsSinceUpdate / 12) * 0.1), // Confidence decreases over time
      };
    }

    return {
      success: false,
      source: 'estimated',
      confidence: 0,
      error: 'Insufficient data for private company valuation',
    };
  }
}