/**
 * FMV API Rate Limiting System
 * 
 * Manages rate limits for different FMV API providers to prevent
 * exceeding quotas and ensure fair usage.
 */

import { internalMutation, query } from '../_generated/server';
import { v } from 'convex/values';

// Rate limit window types
type RateLimitWindow = 'minute' | 'hour' | 'day';

// Provider rate limit configurations
const RATE_LIMITS = {
  yahoo: {
    minute: 100,
    hour: 2000,
    day: 10000,
  },
  alphavantage: {
    minute: 5,
    hour: 300,
    day: 500,
  },
  finnhub: {
    minute: 60,
    hour: 1000,
    day: 5000,
  },
};

/**
 * Check if API call is allowed under rate limits
 */
export const checkRateLimit = internalMutation({
  args: {
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const provider = args.provider;
    
    if (!RATE_LIMITS[provider as keyof typeof RATE_LIMITS]) {
      console.warn(`Unknown provider for rate limiting: ${provider}`);
      return { allowed: true };
    }
    
    const limits = RATE_LIMITS[provider as keyof typeof RATE_LIMITS];
    
    // Check each window
    for (const [window, limit] of Object.entries(limits)) {
      const windowMs = getWindowMilliseconds(window as RateLimitWindow);
      const windowStart = now - windowMs;
      
      // Count calls in this window
      const calls = await ctx.db
        .query('fmvRateLimits')
        .withIndex('by_provider_and_time', (q) => 
          q.eq('provider', provider)
            .gte('timestamp', windowStart)
            .lte('timestamp', now)
        )
        .collect();
      
      if (calls.length >= limit) {
        return {
          allowed: false,
          reason: `Rate limit exceeded: ${calls.length}/${limit} calls in ${window}`,
          resetAt: windowStart + windowMs,
          window,
        };
      }
    }
    
    return { allowed: true };
  },
});

/**
 * Track an API call for rate limiting
 */
export const trackApiCall = internalMutation({
  args: {
    provider: v.string(),
    success: v.boolean(),
    responseTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    await ctx.db.insert('fmvRateLimits', {
      provider: args.provider,
      timestamp: now,
      success: args.success,
      responseTime: args.responseTime,
    });
    
    // Clean up old entries periodically
    await cleanupOldEntries(ctx, args.provider);
  },
});

/**
 * Get current rate limit status for a provider
 */
export const getRateLimitStatus = query({
  args: {
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const provider = args.provider;
    
    if (!RATE_LIMITS[provider as keyof typeof RATE_LIMITS]) {
      return { error: `Unknown provider: ${provider}` };
    }
    
    const limits = RATE_LIMITS[provider as keyof typeof RATE_LIMITS];
    const status: any = {
      provider,
      limits,
      usage: {},
      remaining: {},
      resetTimes: {},
    };
    
    for (const [window, limit] of Object.entries(limits)) {
      const windowMs = getWindowMilliseconds(window as RateLimitWindow);
      const windowStart = now - windowMs;
      
      const calls = await ctx.db
        .query('fmvRateLimits')
        .withIndex('by_provider_and_time', (q) => 
          q.eq('provider', provider)
            .gte('timestamp', windowStart)
            .lte('timestamp', now)
        )
        .collect();
      
      status.usage[window] = calls.length;
      status.remaining[window] = Math.max(0, limit - calls.length);
      status.resetTimes[window] = windowStart + windowMs;
      
      // Calculate percentage used
      status[`${window}PercentUsed`] = ((calls.length / limit) * 100).toFixed(1) + '%';
    }
    
    return status;
  },
});

/**
 * Get rate limit statistics across all providers
 */
export const getRateLimitStats = query({
  handler: async (ctx) => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    
    const allCalls = await ctx.db
      .query('fmvRateLimits')
      .withIndex('by_timestamp', (q) => q.gte('timestamp', dayAgo))
      .collect();
    
    // Group by provider
    const byProvider = allCalls.reduce((acc, call) => {
      if (!acc[call.provider]) {
        acc[call.provider] = {
          total: 0,
          successful: 0,
          failed: 0,
          avgResponseTime: 0,
          responseTimes: [],
        };
      }
      
      acc[call.provider].total++;
      if (call.success) {
        acc[call.provider].successful++;
      } else {
        acc[call.provider].failed++;
      }
      
      if (call.responseTime) {
        acc[call.provider].responseTimes.push(call.responseTime);
      }
      
      return acc;
    }, {} as Record<string, any>);
    
    // Calculate averages
    for (const provider in byProvider) {
      const stats = byProvider[provider];
      if (stats.responseTimes.length > 0) {
        stats.avgResponseTime = 
          stats.responseTimes.reduce((a: number, b: number) => a + b, 0) / stats.responseTimes.length;
      }
      delete stats.responseTimes; // Remove raw data
      
      // Add success rate
      stats.successRate = stats.total > 0 
        ? ((stats.successful / stats.total) * 100).toFixed(1) + '%'
        : '0%';
    }
    
    return {
      timeRange: { start: dayAgo, end: now },
      totalCalls: allCalls.length,
      byProvider,
    };
  },
});

/**
 * Reset rate limits for a provider (admin function)
 */
export const resetRateLimits = internalMutation({
  args: {
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query('fmvRateLimits')
      .withIndex('by_provider', (q) => q.eq('provider', args.provider))
      .collect();
    
    let deletedCount = 0;
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }
    
    return {
      success: true,
      message: `Reset rate limits for ${args.provider}`,
      deletedCount,
    };
  },
});

/**
 * Clean up old rate limit entries
 */
async function cleanupOldEntries(ctx: any, provider: string) {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  
  const oldEntries = await ctx.db
    .query('fmvRateLimits')
    .withIndex('by_provider_and_time', (q) => 
      q.eq('provider', provider).lt('timestamp', dayAgo)
    )
    .collect();
  
  // Delete in batches to avoid timeout
  const batchSize = 100;
  for (let i = 0; i < oldEntries.length; i += batchSize) {
    const batch = oldEntries.slice(i, i + batchSize);
    await Promise.all(batch.map(entry => ctx.db.delete(entry._id)));
  }
}

/**
 * Get window duration in milliseconds
 */
function getWindowMilliseconds(window: RateLimitWindow): number {
  switch (window) {
    case 'minute':
      return 60 * 1000;
    case 'hour':
      return 60 * 60 * 1000;
    case 'day':
      return 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown rate limit window: ${window}`);
  }
}

/**
 * Circuit breaker for provider failures
 */
export const checkCircuitBreaker = internalMutation({
  args: {
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    // Check recent failures
    const recentCalls = await ctx.db
      .query('fmvRateLimits')
      .withIndex('by_provider_and_time', (q) => 
        q.eq('provider', args.provider)
          .gte('timestamp', fiveMinutesAgo)
          .lte('timestamp', now)
      )
      .collect();
    
    const failures = recentCalls.filter(call => !call.success).length;
    const total = recentCalls.length;
    
    // Open circuit if failure rate > 50% with at least 5 calls
    if (total >= 5 && failures / total > 0.5) {
      return {
        open: true,
        reason: `High failure rate: ${failures}/${total} failed in last 5 minutes`,
        resetAt: now + 5 * 60 * 1000, // Reset in 5 minutes
      };
    }
    
    return { open: false };
  },
});

/**
 * Get rate limit recommendations based on usage patterns
 */
export const getRateLimitRecommendations = query({
  handler: async (ctx) => {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    
    const recentCalls = await ctx.db
      .query('fmvRateLimits')
      .withIndex('by_timestamp', (q) => q.gte('timestamp', hourAgo))
      .collect();
    
    const recommendations = [];
    
    // Group by provider
    const byProvider = recentCalls.reduce((acc, call) => {
      acc[call.provider] = (acc[call.provider] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [provider, count] of Object.entries(byProvider)) {
      const limits = RATE_LIMITS[provider as keyof typeof RATE_LIMITS];
      if (!limits) continue;
      
      const hourlyUsage = (count / limits.hour) * 100;
      
      if (hourlyUsage > 80) {
        recommendations.push({
          provider,
          severity: 'high',
          message: `${provider} is at ${hourlyUsage.toFixed(1)}% of hourly limit. Consider using fallback providers.`,
        });
      } else if (hourlyUsage > 60) {
        recommendations.push({
          provider,
          severity: 'medium',
          message: `${provider} usage is elevated at ${hourlyUsage.toFixed(1)}% of hourly limit.`,
        });
      }
    }
    
    // Check for providers not being used
    const allProviders = Object.keys(RATE_LIMITS);
    const unusedProviders = allProviders.filter(p => !byProvider[p]);
    
    if (unusedProviders.length > 0) {
      recommendations.push({
        severity: 'info',
        message: `Providers not utilized: ${unusedProviders.join(', ')}. Consider distributing load.`,
      });
    }
    
    return recommendations;
  },
});