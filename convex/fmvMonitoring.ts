/**
 * FMV API Monitoring and Alerting System
 * 
 * Provides comprehensive monitoring, alerting, and health checks
 * for the FMV API integration system.
 */

import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';

// FMV monitoring alert types
type AlertType = 'rate_limit' | 'api_failure' | 'cache_miss' | 'timeout' | 'circuit_breaker';
type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

// Create FMV monitoring alert
export const createFMVAlert = internalMutation({
  args: {
    type: v.union(
      v.literal('rate_limit'),
      v.literal('api_failure'), 
      v.literal('cache_miss'),
      v.literal('timeout'),
      v.literal('circuit_breaker')
    ),
    severity: v.union(
      v.literal('low'),
      v.literal('medium'), 
      v.literal('high'),
      v.literal('critical')
    ),
    provider: v.string(),
    message: v.string(),
    metadata: v.optional(v.object({
      ticker: v.optional(v.string()),
      responseTime: v.optional(v.number()),
      errorCode: v.optional(v.string()),
      retryCount: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    await ctx.db.insert('fmvAlerts', {
      type: args.type,
      severity: args.severity,
      provider: args.provider,
      message: args.message,
      metadata: args.metadata,
      timestamp: now,
      acknowledged: false,
      createdAt: now,
    });
    
    // Check if we need to escalate based on alert frequency
    await checkAlertEscalation(ctx, args.type, args.provider);
  },
});

// Get FMV system health status
export const getFMVSystemHealth = query({
  handler: async (ctx) => {
    const now = Date.now();
    const last24Hours = now - 24 * 60 * 60 * 1000;
    const lastHour = now - 60 * 60 * 1000;
    
    try {
      // Get recent alerts
      const recentAlerts = await ctx.db
        .query('fmvAlerts')
        .withIndex('by_timestamp', (q) => q.gte('timestamp', last24Hours))
        .collect();
      
      // Get rate limit status
      const rateLimitData = await ctx.db
        .query('fmvRateLimits')
        .withIndex('by_timestamp', (q) => q.gte('timestamp', lastHour))
        .collect();
      
      // Get cache performance
      const cacheEntries = await ctx.db
        .query('fmvCache')
        .collect();
      
      // Calculate metrics
      const alertCounts = recentAlerts.reduce((acc, alert) => {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1;
        acc.total++;
        return acc;
      }, { low: 0, medium: 0, high: 0, critical: 0, total: 0 });
      
      const providerStats = calculateProviderStats(rateLimitData);
      const cacheStats = calculateCacheStats(cacheEntries, now);
      
      // Calculate overall health score
      const healthScore = calculateFMVHealthScore(alertCounts, providerStats, cacheStats);
      
      return {
        timestamp: now,
        healthScore,
        status: getHealthStatus(healthScore),
        alerts: {
          last24Hours: alertCounts.total,
          bySeverity: {
            low: alertCounts.low,
            medium: alertCounts.medium,
            high: alertCounts.high,
            critical: alertCounts.critical,
          },
          recentAlerts: recentAlerts.slice(-5).map(alert => ({
            type: alert.type,
            severity: alert.severity,
            provider: alert.provider,
            message: alert.message,
            timestamp: alert.timestamp,
          })),
        },
        providers: providerStats,
        cache: cacheStats,
        recommendations: generateHealthRecommendations(healthScore, alertCounts, providerStats),
      };
      
    } catch (error) {
      console.error('Error getting FMV system health:', error);
      return {
        timestamp: now,
        healthScore: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// Get FMV provider performance metrics
export const getFMVProviderMetrics = query({
  args: {
    provider: v.optional(v.string()),
    timeRange: v.optional(v.number()), // hours
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const timeRange = args.timeRange || 24; // Default 24 hours
    const startTime = now - timeRange * 60 * 60 * 1000;
    
    let query = ctx.db
      .query('fmvRateLimits')
      .withIndex('by_timestamp', (q) => q.gte('timestamp', startTime));
    
    if (args.provider) {
      query = query.filter((q) => q.eq(q.field('provider'), args.provider));
    }
    
    const rateLimitData = await query.collect();
    
    // Group by provider
    const providerMetrics = rateLimitData.reduce((acc, record) => {
      if (!acc[record.provider]) {
        acc[record.provider] = {
          provider: record.provider,
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          responseTimes: [],
          errorTypes: {},
        };
      }
      
      acc[record.provider].totalCalls++;
      if (record.success) {
        acc[record.provider].successfulCalls++;
      } else {
        acc[record.provider].failedCalls++;
      }
      
      if (record.responseTime) {
        acc[record.provider].responseTimes.push(record.responseTime);
      }
      
      return acc;
    }, {} as Record<string, any>);
    
    // Calculate derived metrics
    Object.values(providerMetrics).forEach((metrics: any) => {
      metrics.successRate = metrics.totalCalls > 0 
        ? (metrics.successfulCalls / metrics.totalCalls * 100).toFixed(2) + '%'
        : '0%';
      
      if (metrics.responseTimes.length > 0) {
        const times = metrics.responseTimes.sort((a: number, b: number) => a - b);
        metrics.averageResponseTime = Math.round(
          metrics.responseTimes.reduce((a: number, b: number) => a + b, 0) / metrics.responseTimes.length
        );
        metrics.p50ResponseTime = times[Math.floor(times.length * 0.5)];
        metrics.p95ResponseTime = times[Math.floor(times.length * 0.95)];
        metrics.p99ResponseTime = times[Math.floor(times.length * 0.99)];
      }
      
      delete metrics.responseTimes; // Remove raw data
    });
    
    return {
      timeRange: `${timeRange} hours`,
      startTime,
      endTime: now,
      providers: Object.values(providerMetrics),
      summary: {
        totalProviders: Object.keys(providerMetrics).length,
        totalCalls: Object.values(providerMetrics).reduce((sum: number, p: any) => sum + p.totalCalls, 0),
        overallSuccessRate: calculateOverallSuccessRate(Object.values(providerMetrics)),
      },
    };
  },
});

// Acknowledge FMV alerts
export const acknowledgeFMVAlerts = mutation({
  args: {
    alertIds: v.array(v.id('fmvAlerts')),
    userId: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = [];
    
    for (const alertId of args.alertIds) {
      try {
        await ctx.db.patch(alertId, {
          acknowledged: true,
          acknowledgedBy: args.userId,
          acknowledgedAt: now,
          acknowledgedNotes: args.notes,
        });
        results.push({ alertId, success: true });
      } catch (error) {
        results.push({ 
          alertId, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
    
    return {
      totalProcessed: args.alertIds.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  },
});

// Get unacknowledged FMV alerts
export const getUnacknowledgedAlerts = query({
  args: {
    severity: v.optional(v.union(
      v.literal('low'),
      v.literal('medium'), 
      v.literal('high'),
      v.literal('critical')
    )),
    provider: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query('fmvAlerts')
      .withIndex('by_acknowledged', (q) => q.eq('acknowledged', false));
    
    if (args.severity) {
      query = query.filter((q) => q.eq(q.field('severity'), args.severity));
    }
    
    if (args.provider) {
      query = query.filter((q) => q.eq(q.field('provider'), args.provider));
    }
    
    const alerts = await query
      .order('desc')
      .take(args.limit || 50);
    
    return {
      total: alerts.length,
      alerts: alerts.map(alert => ({
        _id: alert._id,
        type: alert.type,
        severity: alert.severity,
        provider: alert.provider,
        message: alert.message,
        metadata: alert.metadata,
        timestamp: alert.timestamp,
        age: Date.now() - alert.timestamp,
      })),
    };
  },
});

// Helper function to check if alerts need escalation
async function checkAlertEscalation(ctx: any, alertType: string, provider: string) {
  const now = Date.now();
  const last15Minutes = now - 15 * 60 * 1000;
  
  // Count recent alerts of the same type and provider
  const recentAlerts = await ctx.db
    .query('fmvAlerts')
    .withIndex('by_timestamp', (q: any) => q.gte('timestamp', last15Minutes))
    .filter((q: any) => 
      q.and(
        q.eq(q.field('type'), alertType),
        q.eq(q.field('provider'), provider)
      )
    )
    .collect();
  
  // Escalate if too many similar alerts
  if (recentAlerts.length >= 5) {
    await ctx.db.insert('fmvAlerts', {
      type: 'circuit_breaker',
      severity: 'critical',
      provider,
      message: `High frequency of ${alertType} alerts detected for ${provider}. Consider circuit breaker activation.`,
      metadata: {
        alertCount: recentAlerts.length,
        timeWindow: '15 minutes',
        triggerType: alertType,
      },
      timestamp: now,
      acknowledged: false,
      createdAt: now,
    });
  }
}

// Helper function to calculate provider statistics
function calculateProviderStats(rateLimitData: any[]) {
  const providers = ['yahoo', 'alphavantage', 'finnhub'];
  
  return providers.map(provider => {
    const providerData = rateLimitData.filter(r => r.provider === provider);
    const totalCalls = providerData.length;
    const successfulCalls = providerData.filter(r => r.success).length;
    const failedCalls = totalCalls - successfulCalls;
    
    const avgResponseTime = providerData.length > 0
      ? providerData
          .filter(r => r.responseTime)
          .reduce((sum, r) => sum + r.responseTime, 0) / providerData.filter(r => r.responseTime).length
      : 0;
    
    return {
      provider,
      totalCalls,
      successfulCalls,
      failedCalls,
      successRate: totalCalls > 0 ? (successfulCalls / totalCalls * 100).toFixed(1) + '%' : '0%',
      averageResponseTime: Math.round(avgResponseTime) || 0,
      status: getProviderStatus(successfulCalls, totalCalls, avgResponseTime),
    };
  });
}

// Helper function to calculate cache statistics
function calculateCacheStats(cacheEntries: any[], currentTime: number) {
  const validEntries = cacheEntries.filter(entry => entry.expiresAt > currentTime);
  const expiredEntries = cacheEntries.filter(entry => entry.expiresAt <= currentTime);
  
  const totalHits = validEntries.reduce((sum, entry) => sum + (entry.hits || 0), 0);
  const averageHits = validEntries.length > 0 ? totalHits / validEntries.length : 0;
  
  return {
    totalEntries: cacheEntries.length,
    validEntries: validEntries.length,
    expiredEntries: expiredEntries.length,
    totalHits,
    averageHitsPerEntry: Math.round(averageHits * 10) / 10,
    cacheEfficiency: validEntries.length > 0 ? (totalHits / validEntries.length * 100).toFixed(1) + '%' : '0%',
    status: getCacheStatus(validEntries.length, expiredEntries.length, totalHits),
  };
}

// Helper function to calculate FMV health score
function calculateFMVHealthScore(alertCounts: any, providerStats: any[], cacheStats: any): number {
  let score = 100;
  
  // Deduct for alerts
  score -= alertCounts.critical * 20;
  score -= alertCounts.high * 10;
  score -= alertCounts.medium * 5;
  score -= alertCounts.low * 1;
  
  // Factor in provider performance
  const avgProviderScore = providerStats.reduce((sum, provider) => {
    const successRate = parseFloat(provider.successRate.replace('%', ''));
    const responseScore = provider.averageResponseTime < 1000 ? 100 : Math.max(0, 100 - (provider.averageResponseTime - 1000) / 100);
    return sum + (successRate + responseScore) / 2;
  }, 0) / providerStats.length;
  
  score = (score + avgProviderScore) / 2;
  
  // Factor in cache performance
  const cacheScore = cacheStats.validEntries > 0 ? Math.min(100, cacheStats.totalHits / cacheStats.validEntries * 20) : 0;
  score = (score * 0.8) + (cacheScore * 0.2);
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

// Helper function to get health status from score
function getHealthStatus(score: number): string {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'fair';
  if (score >= 25) return 'poor';
  return 'critical';
}

// Helper function to get provider status
function getProviderStatus(successful: number, total: number, avgResponseTime: number): string {
  const successRate = total > 0 ? successful / total : 0;
  
  if (successRate >= 0.95 && avgResponseTime < 1000) return 'excellent';
  if (successRate >= 0.90 && avgResponseTime < 2000) return 'good';
  if (successRate >= 0.75 && avgResponseTime < 5000) return 'fair';
  if (successRate >= 0.50) return 'poor';
  return 'critical';
}

// Helper function to get cache status
function getCacheStatus(valid: number, expired: number, hits: number): string {
  const total = valid + expired;
  const validRatio = total > 0 ? valid / total : 0;
  const avgHits = valid > 0 ? hits / valid : 0;
  
  if (validRatio >= 0.9 && avgHits >= 5) return 'excellent';
  if (validRatio >= 0.8 && avgHits >= 3) return 'good';
  if (validRatio >= 0.6 && avgHits >= 1) return 'fair';
  if (validRatio >= 0.4) return 'poor';
  return 'critical';
}

// Helper function to calculate overall success rate
function calculateOverallSuccessRate(providers: any[]): string {
  const totals = providers.reduce((acc, provider) => {
    acc.successful += provider.successfulCalls;
    acc.total += provider.totalCalls;
    return acc;
  }, { successful: 0, total: 0 });
  
  return totals.total > 0 
    ? (totals.successful / totals.total * 100).toFixed(2) + '%'
    : '0%';
}

// Helper function to generate health recommendations
function generateHealthRecommendations(healthScore: number, alertCounts: any, providerStats: any[]): string[] {
  const recommendations = [];
  
  if (healthScore < 50) {
    recommendations.push('System health is critical. Consider immediate intervention.');
  }
  
  if (alertCounts.critical > 0) {
    recommendations.push('Address critical alerts immediately to prevent service degradation.');
  }
  
  if (alertCounts.high > 5) {
    recommendations.push('High number of high-severity alerts. Review provider configurations.');
  }
  
  const poorProviders = providerStats.filter(p => p.status === 'poor' || p.status === 'critical');
  if (poorProviders.length > 0) {
    recommendations.push(`Poor performing providers: ${poorProviders.map(p => p.provider).join(', ')}. Consider fallback strategies.`);
  }
  
  const slowProviders = providerStats.filter(p => p.averageResponseTime > 3000);
  if (slowProviders.length > 0) {
    recommendations.push(`Slow response times from: ${slowProviders.map(p => p.provider).join(', ')}. Check network connectivity.`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('System is performing well. Continue monitoring.');
  }
  
  return recommendations;
}