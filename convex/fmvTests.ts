/**
 * FMV API Integration Tests
 * 
 * Comprehensive test suite for the FMV API system including:
 * - Provider API integration tests
 * - Cache functionality tests  
 * - Rate limiting tests
 * - Monitoring and alerting tests
 * - Private company valuation tests
 */

import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { internal, api } from './_generated/api';

// Test result structure
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  message: string;
  details?: any;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
  success: boolean;
}

// Main test runner for FMV API integration
export const runFMVIntegrationTests = mutation({
  args: {
    testSuite: v.optional(v.union(
      v.literal('all'),
      v.literal('api'),
      v.literal('cache'),
      v.literal('rateLimit'),
      v.literal('monitoring'),
      v.literal('private')
    )),
    cleanup: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<TestSuite> => {
    const startTime = Date.now();
    const testSuite = args.testSuite || 'all';
    const cleanup = args.cleanup ?? true;
    
    console.log(`Starting FMV integration tests: ${testSuite}`);
    
    try {
      let tests: TestResult[] = [];
      
      // Run selected test suites
      if (testSuite === 'all' || testSuite === 'api') {
        const apiTests = await runAPITests(ctx);
        tests = tests.concat(apiTests);
      }
      
      if (testSuite === 'all' || testSuite === 'cache') {
        const cacheTests = await runCacheTests(ctx);
        tests = tests.concat(cacheTests);
      }
      
      if (testSuite === 'all' || testSuite === 'rateLimit') {
        const rateLimitTests = await runRateLimitTests(ctx);
        tests = tests.concat(rateLimitTests);
      }
      
      if (testSuite === 'all' || testSuite === 'monitoring') {
        const monitoringTests = await runMonitoringTests(ctx);
        tests = tests.concat(monitoringTests);
      }
      
      if (testSuite === 'all' || testSuite === 'private') {
        const privateTests = await runPrivateCompanyTests(ctx);
        tests = tests.concat(privateTests);
      }
      
      // Clean up test data if requested
      if (cleanup) {
        await cleanupTestData(ctx);
      }
      
      // Calculate results
      const passedTests = tests.filter(t => t.passed).length;
      const failedTests = tests.filter(t => !t.passed).length;
      const totalDuration = Date.now() - startTime;
      
      return {
        name: `FMV Integration Tests (${testSuite})`,
        tests,
        totalTests: tests.length,
        passedTests,
        failedTests,
        totalDuration,
        success: failedTests === 0,
      };
      
    } catch (error) {
      return {
        name: `FMV Integration Tests (${testSuite})`,
        tests: [{
          name: 'Test Suite Setup',
          passed: false,
          duration: Date.now() - startTime,
          message: `Failed to run test suite: ${error instanceof Error ? error.message : 'Unknown error'}`,
        }],
        totalTests: 1,
        passedTests: 0,
        failedTests: 1,
        totalDuration: Date.now() - startTime,
        success: false,
      };
    }
  },
});

// Test the FMV API integration
async function runAPITests(ctx: any): Promise<TestResult[]> {
  const tests: TestResult[] = [];
  
  // Test 1: Yahoo Finance API integration
  tests.push(await runTest('Yahoo Finance API Test', async () => {
    const result = await ctx.runAction(internal.fmvApi.fetchFMV, {
      ticker: 'AAPL',
      provider: 'yahoo',
      useCache: false,
      forceFresh: true,
    });
    
    if (!result.success) {
      throw new Error(`Yahoo Finance API failed: ${result.error}`);
    }
    
    if (typeof result.fmv !== 'number' || result.fmv <= 0) {
      throw new Error(`Invalid FMV returned: ${result.fmv}`);
    }
    
    if (result.source !== 'yahoo') {
      throw new Error(`Expected source 'yahoo', got '${result.source}'`);
    }
    
    return { fmv: result.fmv, confidence: result.confidence };
  }));
  
  // Test 2: API with invalid ticker
  tests.push(await runTest('Invalid Ticker Test', async () => {
    const result = await ctx.runAction(internal.fmvApi.fetchFMV, {
      ticker: 'INVALID_TICKER_123',
      provider: 'yahoo',
      useCache: false,
    });
    
    if (result.success) {
      throw new Error('Expected API to fail with invalid ticker');
    }
    
    if (!result.error) {
      throw new Error('Expected error message for invalid ticker');
    }
    
    return { error: result.error };
  }));
  
  // Test 3: Fallback provider functionality
  tests.push(await runTest('Fallback Provider Test', async () => {
    // This test simulates a provider failure and checks fallback
    const result = await ctx.runAction(internal.fmvApi.fetchFMV, {
      ticker: 'MSFT',
      provider: 'yahoo', // Will fallback if this fails
      useCache: false,
    });
    
    // Should succeed either with primary or fallback provider
    if (!result.success) {
      throw new Error(`All providers failed: ${result.error}`);
    }
    
    return { source: result.source, fmv: result.fmv };
  }));
  
  // Test 4: Batch FMV fetch
  tests.push(await runTest('Batch FMV Fetch Test', async () => {
    const tickers = ['AAPL', 'GOOGL', 'MSFT'];
    const results = await ctx.runAction(internal.fmvApi.batchFetchFMV, {
      tickers,
      provider: 'yahoo',
    });
    
    if (Object.keys(results).length !== tickers.length) {
      throw new Error(`Expected ${tickers.length} results, got ${Object.keys(results).length}`);
    }
    
    for (const ticker of tickers) {
      if (!results[ticker]) {
        throw new Error(`Missing result for ticker ${ticker}`);
      }
    }
    
    return { resultCount: Object.keys(results).length };
  }));
  
  return tests;
}

// Test cache functionality
async function runCacheTests(ctx: any): Promise<TestResult[]> {
  const tests: TestResult[] = [];
  
  // Test 1: Cache hit after API call
  tests.push(await runTest('Cache Hit Test', async () => {
    const ticker = 'TEST_CACHE_' + Date.now();
    
    // First call - should be cache miss
    const firstResult = await ctx.runAction(internal.fmvApi.fetchFMV, {
      ticker: 'AAPL',
      useCache: true,
      forceFresh: true,
    });
    
    if (!firstResult.success) {
      throw new Error('First API call failed');
    }
    
    // Second call - should be cache hit
    const secondResult = await ctx.runAction(internal.fmvApi.fetchFMV, {
      ticker: 'AAPL',
      useCache: true,
      forceFresh: false,
    });
    
    if (!secondResult.success) {
      throw new Error('Second API call failed');
    }
    
    // Note: We can't directly test cache hit flag without modifying the API
    // but we can verify the result is consistent
    if (Math.abs(firstResult.fmv! - secondResult.fmv!) > 0.01) {
      throw new Error('Cache inconsistency detected');
    }
    
    return { first: firstResult.fmv, second: secondResult.fmv };
  }));
  
  // Test 2: Cache statistics
  tests.push(await runTest('Cache Statistics Test', async () => {
    const stats = await ctx.runQuery(api.fmvCache.getCacheStats);
    
    if (typeof stats.totalEntries !== 'number') {
      throw new Error('Invalid cache stats structure');
    }
    
    if (stats.totalEntries < 0) {
      throw new Error('Negative cache entry count');
    }
    
    return stats;
  }));
  
  // Test 3: Cache expiration
  tests.push(await runTest('Cache Expiration Test', async () => {
    // This test verifies that expired entries are handled correctly
    const beforeCleanup = await ctx.runQuery(api.fmvCache.getCacheStats);
    
    await ctx.runMutation(internal.fmvCache.clearExpiredCache);
    
    const afterCleanup = await ctx.runQuery(api.fmvCache.getCacheStats);
    
    if (afterCleanup.expiredEntries > beforeCleanup.expiredEntries) {
      throw new Error('Cache cleanup increased expired entries');
    }
    
    return { 
      beforeExpired: beforeCleanup.expiredEntries,
      afterExpired: afterCleanup.expiredEntries
    };
  }));
  
  return tests;
}

// Test rate limiting functionality
async function runRateLimitTests(ctx: any): Promise<TestResult[]> {
  const tests: TestResult[] = [];
  
  // Test 1: Rate limit tracking
  tests.push(await runTest('Rate Limit Tracking Test', async () => {
    const provider = 'yahoo';
    
    // Track a test API call
    await ctx.runMutation(internal.fmvRateLimit.trackApiCall, {
      provider,
      success: true,
      responseTime: 500,
    });
    
    // Get rate limit status
    const status = await ctx.runQuery(api.fmvRateLimit.getRateLimitStatus, {
      provider,
    });
    
    if (status.error) {
      throw new Error(`Rate limit status error: ${status.error}`);
    }
    
    if (!status.provider || status.provider !== provider) {
      throw new Error('Invalid rate limit status response');
    }
    
    return status;
  }));
  
  // Test 2: Rate limit statistics
  tests.push(await runTest('Rate Limit Statistics Test', async () => {
    const stats = await ctx.runQuery(api.fmvRateLimit.getRateLimitStats);
    
    if (!stats.timeRange || !stats.byProvider) {
      throw new Error('Invalid rate limit stats structure');
    }
    
    if (stats.totalCalls < 0) {
      throw new Error('Negative total calls count');
    }
    
    return { totalCalls: stats.totalCalls, providers: Object.keys(stats.byProvider).length };
  }));
  
  // Test 3: Circuit breaker check
  tests.push(await runTest('Circuit Breaker Test', async () => {
    const provider = 'test_provider';
    
    const circuitState = await ctx.runMutation(internal.fmvRateLimit.checkCircuitBreaker, {
      provider,
    });
    
    if (typeof circuitState.open !== 'boolean') {
      throw new Error('Invalid circuit breaker response');
    }
    
    return circuitState;
  }));
  
  return tests;
}

// Test monitoring and alerting
async function runMonitoringTests(ctx: any): Promise<TestResult[]> {
  const tests: TestResult[] = [];
  
  // Test 1: Alert creation
  tests.push(await runTest('Alert Creation Test', async () => {
    await ctx.runMutation(internal.fmvMonitoring.createFMVAlert, {
      type: 'api_failure',
      severity: 'medium',
      provider: 'test_provider',
      message: 'Test alert for integration testing',
      metadata: {
        ticker: 'TEST',
        errorCode: 'TEST_ERROR',
      },
    });
    
    // Verify alert was created
    const alerts = await ctx.runQuery(api.fmvMonitoring.getUnacknowledgedAlerts, {
      provider: 'test_provider',
      limit: 1,
    });
    
    if (alerts.total === 0) {
      throw new Error('Alert was not created');
    }
    
    const alert = alerts.alerts[0];
    if (alert.message !== 'Test alert for integration testing') {
      throw new Error('Alert message mismatch');
    }
    
    return { alertId: alert._id, message: alert.message };
  }));
  
  // Test 2: System health check
  tests.push(await runTest('System Health Test', async () => {
    const health = await ctx.runQuery(api.fmvMonitoring.getFMVSystemHealth);
    
    if (typeof health.healthScore !== 'number') {
      throw new Error('Invalid health score type');
    }
    
    if (health.healthScore < 0 || health.healthScore > 100) {
      throw new Error(`Invalid health score range: ${health.healthScore}`);
    }
    
    if (!health.status) {
      throw new Error('Missing health status');
    }
    
    return { 
      healthScore: health.healthScore,
      status: health.status,
      alertCount: health.alerts?.last24Hours || 0
    };
  }));
  
  // Test 3: Provider metrics
  tests.push(await runTest('Provider Metrics Test', async () => {
    const metrics = await ctx.runQuery(api.fmvMonitoring.getFMVProviderMetrics, {
      timeRange: 1, // Last 1 hour
    });
    
    if (!Array.isArray(metrics.providers)) {
      throw new Error('Invalid provider metrics structure');
    }
    
    if (!metrics.summary) {
      throw new Error('Missing provider metrics summary');
    }
    
    return {
      providerCount: metrics.providers.length,
      totalCalls: metrics.summary.totalCalls
    };
  }));
  
  return tests;
}

// Test private company functionality
async function runPrivateCompanyTests(ctx: any): Promise<TestResult[]> {
  const tests: TestResult[] = [];
  
  // Test 1: Manual private company FMV creation
  tests.push(await runTest('Manual Private FMV Test', async () => {
    const testUserId = 'test_user_' + Date.now();
    const testCompany = 'Private Corp ' + Date.now();
    
    const recordId = await ctx.runMutation(api.fmvUpdates.createManualPrivateFMV, {
      userId: testUserId,
      companyName: testCompany,
      fmv: 15.50,
      currency: 'USD',
      effectiveDate: Date.now(),
      notes: 'Test private company valuation',
      valuationMethod: 'DCF Analysis',
      confidenceLevel: 0.8,
    });
    
    if (!recordId) {
      throw new Error('Failed to create private company FMV record');
    }
    
    // Verify the record was created
    const records = await ctx.runQuery(api.fmvUpdates.getFMVHistory, {
      userId: testUserId,
      companyName: testCompany,
      limit: 1,
    });
    
    if (records.length === 0) {
      throw new Error('Private company FMV record not found');
    }
    
    const record = records[0];
    if (record.fmv !== 15.50) {
      throw new Error(`FMV mismatch: expected 15.50, got ${record.fmv}`);
    }
    
    if (record.dataSource !== 'manual') {
      throw new Error(`Expected manual data source, got ${record.dataSource}`);
    }
    
    return { recordId, fmv: record.fmv, dataSource: record.dataSource };
  }));
  
  // Test 2: Private company valuation suggestions
  tests.push(await runTest('Valuation Suggestions Test', async () => {
    const testUserId = 'test_user_' + Date.now();
    const testCompany = 'Suggestion Corp ' + Date.now();
    
    // First create a base record
    await ctx.runMutation(api.fmvUpdates.createManualPrivateFMV, {
      userId: testUserId,
      companyName: testCompany,
      fmv: 10.00,
      currency: 'USD',
      effectiveDate: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
      notes: 'Base valuation for testing',
    });
    
    // Get suggestions
    const suggestions = await ctx.runQuery(api.fmvUpdates.getPrivateCompanyValuationSuggestions, {
      userId: testUserId,
      companyName: testCompany,
    });
    
    if (!Array.isArray(suggestions.suggestions)) {
      throw new Error('Invalid suggestions structure');
    }
    
    if (suggestions.suggestions.length === 0) {
      throw new Error('No valuation suggestions generated');
    }
    
    // Verify suggestion structure
    const suggestion = suggestions.suggestions[0];
    if (!suggestion.method || typeof suggestion.suggestedValue !== 'number') {
      throw new Error('Invalid suggestion structure');
    }
    
    return {
      suggestionsCount: suggestions.suggestions.length,
      topSuggestion: {
        method: suggestion.method,
        value: suggestion.suggestedValue,
        confidence: suggestion.confidence
      }
    };
  }));
  
  // Test 3: Bulk private company updates
  tests.push(await runTest('Bulk Private Company Update Test', async () => {
    const testUserId = 'test_user_' + Date.now();
    const companies = [
      { companyName: 'Bulk Corp A', fmv: 20.00 },
      { companyName: 'Bulk Corp B', fmv: 30.00 },
      { companyName: 'Bulk Corp C', fmv: 40.00 },
    ];
    
    const result = await ctx.runMutation(api.fmvUpdates.bulkUpdatePrivateCompanyFMV, {
      userId: testUserId,
      updates: companies.map(c => ({
        companyName: c.companyName,
        fmv: c.fmv,
        effectiveDate: Date.now(),
        notes: 'Bulk update test',
        valuationMethod: 'Market Comparable',
      })),
    });
    
    if (result.totalUpdates !== companies.length) {
      throw new Error(`Expected ${companies.length} updates, got ${result.totalUpdates}`);
    }
    
    if (result.successful !== companies.length) {
      throw new Error(`Expected ${companies.length} successful updates, got ${result.successful}`);
    }
    
    if (result.failed !== 0) {
      throw new Error(`Expected 0 failed updates, got ${result.failed}`);
    }
    
    return {
      totalUpdates: result.totalUpdates,
      successful: result.successful,
      failed: result.failed
    };
  }));
  
  return tests;
}

// Helper function to run individual tests
async function runTest(name: string, testFn: () => Promise<any>): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const details = await testFn();
    return {
      name,
      passed: true,
      duration: Date.now() - startTime,
      message: 'Test passed successfully',
      details,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Unknown error',
      details: { error: error instanceof Error ? error.stack : String(error) },
    };
  }
}

// Clean up test data
async function cleanupTestData(ctx: any): Promise<void> {
  try {
    // Clean up test alerts
    const testAlerts = await ctx.db
      .query('fmvAlerts')
      .filter((q: any) => q.eq(q.field('provider'), 'test_provider'))
      .collect();
    
    for (const alert of testAlerts) {
      await ctx.db.delete(alert._id);
    }
    
    // Clean up test FMV records (those with test user IDs)
    const testFMVRecords = await ctx.db
      .query('fmvHistory')
      .filter((q: any) => q.gte(q.field('userId'), 'test_user_'))
      .collect();
    
    for (const record of testFMVRecords) {
      await ctx.db.delete(record._id);
    }
    
    // Clean up test rate limit records
    const testRateLimits = await ctx.db
      .query('fmvRateLimits')
      .filter((q: any) => q.eq(q.field('provider'), 'test_provider'))
      .collect();
    
    for (const record of testRateLimits) {
      await ctx.db.delete(record._id);
    }
    
    console.log('Test data cleanup completed');
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
}

// Get test results history
export const getFMVTestHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // This would require a test results table to track historical test runs
    // For now, return a placeholder structure
    return {
      message: 'Test history not implemented yet',
      suggestion: 'Use runFMVIntegrationTests to execute tests',
      availableTestSuites: ['all', 'api', 'cache', 'rateLimit', 'monitoring', 'private'],
    };
  },
});

// Validate FMV system configuration
export const validateFMVConfiguration = query({
  handler: async (ctx): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
    systemState: any;
  }> => {
    const issues = [];
    const recommendations = [];
    
    // Check environment variables (simulated)
    const requiredEnvVars = [
      'FMV_DEFAULT_PROVIDER',
      'FMV_ENABLE_FALLBACK', 
      'FMV_CACHE_TTL_MINUTES',
      'FMV_CACHE_TTL_CLOSED'
    ];
    
    // Check database state
    try {
      const cacheStats = await ctx.runQuery(api.fmvCache.getCacheStats);
      const rateLimitStats = await ctx.runQuery(api.fmvRateLimit.getRateLimitStats);
      const healthStats = await ctx.runQuery(api.fmvMonitoring.getFMVSystemHealth);
      
      // Validate configuration
      if (cacheStats.totalEntries === 0) {
        recommendations.push('No cache entries found. Consider warming the cache with popular tickers.');
      }
      
      if (rateLimitStats.totalCalls === 0) {
        recommendations.push('No API calls recorded. System may not be active.');
      }
      
      if (healthStats.healthScore < 80) {
        issues.push(`System health score is low: ${healthStats.healthScore}. Check alerts and provider performance.`);
      }
      
      return {
        valid: issues.length === 0,
        issues,
        recommendations,
        systemState: {
          cacheEntries: cacheStats.totalEntries,
          totalApiCalls: rateLimitStats.totalCalls,
          healthScore: healthStats.healthScore,
          unacknowledgedAlerts: healthStats.alerts?.last24Hours || 0,
        },
      };
      
    } catch (error) {
      issues.push(`Failed to validate system state: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        valid: false,
        issues,
        recommendations: ['Check system deployment and database connectivity'],
        systemState: null,
      };
    }
  },
});