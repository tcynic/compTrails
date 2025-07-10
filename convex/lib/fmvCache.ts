/**
 * FMV Cache Management System
 * 
 * Provides caching functionality for FMV data to reduce API calls
 * and improve performance.
 */

import { query, mutation, internalMutation } from '../_generated/server';
import { v } from 'convex/values';
import { FMVResult } from '../actions/fmvApi';

// Cache entry structure
const fmvCacheEntry = {
  ticker: v.string(),
  fmv: v.number(),
  source: v.string(),
  confidence: v.number(),
  cachedAt: v.number(),
  expiresAt: v.number(),
  hits: v.number(), // Track cache hits for analytics
};

/**
 * Get cached FMV data
 */
export const getCachedFMV = internalMutation({
  args: {
    ticker: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Look for cache entry
    const cached = await ctx.db
      .query('fmvCache')
      .withIndex('by_ticker', (q) => q.eq('ticker', args.ticker))
      .filter((q) => q.gt(q.field('expiresAt'), now))
      .first();
    
    if (!cached) {
      return null;
    }
    
    // Increment hit counter
    await ctx.db.patch(cached._id, {
      hits: cached.hits + 1,
    });
    
    return {
      success: true,
      fmv: cached.fmv,
      source: cached.source,
      confidence: cached.confidence,
      timestamp: cached.cachedAt,
    } as FMVResult;
  },
});

/**
 * Store FMV data in cache
 */
export const cacheFMV = internalMutation({
  args: {
    ticker: v.string(),
    result: v.object({
      fmv: v.number(),
      source: v.string(),
      confidence: v.number(),
      timestamp: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Determine cache TTL based on market hours
    const ttl = isMarketHours() 
      ? (parseInt(process.env.FMV_CACHE_TTL_MINUTES || '5') * 60 * 1000)
      : (parseInt(process.env.FMV_CACHE_TTL_CLOSED || '60') * 60 * 1000);
    
    const expiresAt = now + ttl;
    
    // Check if entry exists
    const existing = await ctx.db
      .query('fmvCache')
      .withIndex('by_ticker', (q) => q.eq('ticker', args.ticker))
      .first();
    
    if (existing) {
      // Update existing entry
      await ctx.db.patch(existing._id, {
        fmv: args.result.fmv,
        source: args.result.source,
        confidence: args.result.confidence,
        cachedAt: now,
        expiresAt,
        hits: 0, // Reset hits on update
      });
    } else {
      // Create new entry
      await ctx.db.insert('fmvCache', {
        ticker: args.ticker,
        fmv: args.result.fmv,
        source: args.result.source,
        confidence: args.result.confidence,
        cachedAt: now,
        expiresAt,
        hits: 0,
      });
    }
  },
});

/**
 * Clear expired cache entries
 */
export const clearExpiredCache = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    
    const expired = await ctx.db
      .query('fmvCache')
      .filter((q) => q.lt(q.field('expiresAt'), now))
      .collect();
    
    let deletedCount = 0;
    for (const entry of expired) {
      await ctx.db.delete(entry._id);
      deletedCount++;
    }
    
    return { deletedCount };
  },
});

/**
 * Get cache statistics
 */
export const getCacheStats = query({
  handler: async (ctx) => {
    const now = Date.now();
    
    const allEntries = await ctx.db.query('fmvCache').collect();
    const validEntries = allEntries.filter(e => e.expiresAt > now);
    const expiredEntries = allEntries.filter(e => e.expiresAt <= now);
    
    // Calculate hit rate
    const totalHits = validEntries.reduce((sum, e) => sum + e.hits, 0);
    const avgHitsPerEntry = validEntries.length > 0 ? totalHits / validEntries.length : 0;
    
    // Group by source
    const bySource = validEntries.reduce((acc, entry) => {
      acc[entry.source] = (acc[entry.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalEntries: allEntries.length,
      validEntries: validEntries.length,
      expiredEntries: expiredEntries.length,
      totalHits,
      avgHitsPerEntry,
      bySource,
      oldestEntry: validEntries.length > 0 
        ? Math.min(...validEntries.map(e => e.cachedAt))
        : null,
      newestEntry: validEntries.length > 0
        ? Math.max(...validEntries.map(e => e.cachedAt))
        : null,
    };
  },
});

/**
 * Warm cache for popular tickers
 */
export const warmCache = internalMutation({
  args: {
    tickers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results = [];
    
    for (const ticker of args.tickers) {
      try {
        // Check if already cached
        const existing = await ctx.db
          .query('fmvCache')
          .withIndex('by_ticker', (q) => q.eq('ticker', ticker))
          .filter((q) => q.gt(q.field('expiresAt'), Date.now()))
          .first();
        
        if (!existing) {
          // Would trigger FMV fetch here
          console.log(`Would warm cache for ${ticker}`);
          results.push({ ticker, status: 'warming' });
        } else {
          results.push({ ticker, status: 'already_cached' });
        }
      } catch (error) {
        results.push({ ticker, status: 'error', error: error.message });
      }
    }
    
    return results;
  },
});

/**
 * Invalidate cache for specific ticker
 */
export const invalidateCache = mutation({
  args: {
    ticker: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query('fmvCache')
      .withIndex('by_ticker', (q) => q.eq('ticker', args.ticker))
      .first();
    
    if (entry) {
      await ctx.db.delete(entry._id);
      return { success: true, message: `Cache invalidated for ${args.ticker}` };
    }
    
    return { success: false, message: `No cache entry found for ${args.ticker}` };
  },
});

/**
 * Check if currently in market hours (9:30 AM - 4:00 PM ET)
 */
function isMarketHours(): boolean {
  const now = new Date();
  const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = easternTime.getHours();
  const minute = easternTime.getMinutes();
  const day = easternTime.getDay();
  
  // Weekend check
  if (day === 0 || day === 6) {
    return false;
  }
  
  // Time check (9:30 AM - 4:00 PM)
  const currentMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return currentMinutes >= marketOpen && currentMinutes < marketClose;
}

/**
 * Get cache hit rate for monitoring
 */
export const getCacheHitRate = query({
  args: {
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const start = args.startTime || Date.now() - 24 * 60 * 60 * 1000; // Default: last 24 hours
    const end = args.endTime || Date.now();
    
    // This would need to track actual API calls vs cache hits
    // For now, return estimated based on cache entry hits
    const entries = await ctx.db
      .query('fmvCache')
      .filter((q) => 
        q.and(
          q.gte(q.field('cachedAt'), start),
          q.lte(q.field('cachedAt'), end)
        )
      )
      .collect();
    
    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);
    const totalCalls = entries.length + totalHits; // Rough estimate
    const hitRate = totalCalls > 0 ? (totalHits / totalCalls) * 100 : 0;
    
    return {
      period: { start, end },
      totalHits,
      estimatedTotalCalls: totalCalls,
      hitRate: hitRate.toFixed(2) + '%',
    };
  },
});