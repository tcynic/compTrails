import { mutation, query, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { addMonths, startOfDay, isAfter, isBefore, differenceInMonths } from 'date-fns';

// Internal mutation to process vesting calculations (called by cron job)
export const processVestingCalculations = internalMutation({
  handler: async (ctx) => {
    console.log('Starting vesting calculations...');
    
    const startTime = Date.now();
    let processedCount = 0;
    let errors: string[] = [];
    
    try {
      // Get all users with equity grants
      const allUsers = await ctx.db.query('users').collect();
      console.log(`Found ${allUsers.length} users to process`);
      
      // Process users in batches to manage memory and performance
      const userBatchSize = 10;
      
      for (let i = 0; i < allUsers.length; i += userBatchSize) {
        const userBatch = allUsers.slice(i, i + userBatchSize);
        
        for (const user of userBatch) {
          try {
            // Get all equity grants for this user
            const equityGrants = await ctx.db
              .query('compensationRecords')
              .withIndex('by_user_and_type', (q) => 
                q.eq('userId', user._id).eq('type', 'equity')
              )
              .collect();
            
            if (equityGrants.length === 0) {
              continue;
            }
            
            console.log(`Processing ${equityGrants.length} equity grants for user ${user._id}`);
            
            // Process grants in smaller batches
            const grantBatchSize = 5;
            
            for (let j = 0; j < equityGrants.length; j += grantBatchSize) {
              const grantBatch = equityGrants.slice(j, j + grantBatchSize);
              
              // Process grants in parallel for better performance
              const grantPromises = grantBatch.map(async (grant) => {
                try {
                  const vestingEvents = await calculateVestingEvents(grant);
                  
                  // Process vesting events for this grant
                  const eventPromises = vestingEvents.map(async (event) => {
                    // Check if this vesting event already exists
                    const existingEvent = await ctx.db
                      .query('vestingEvents')
                      .withIndex('by_equity_grant', (q) => q.eq('equityGrantId', grant._id))
                      .filter((q) => q.eq(q.field('vestingDate'), event.vestingDate))
                      .first();
                    
                    if (!existingEvent) {
                      // Create new vesting event
                      await ctx.db.insert('vestingEvents', {
                        userId: user._id,
                        equityGrantId: grant._id,
                        vestingDate: event.vestingDate,
                        sharesVested: event.sharesVested,
                        calculatedAt: Date.now(),
                        grantType: event.grantType,
                        companyName: event.companyName,
                        processed: false,
                        calculationSource: 'automated' as const,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                      });
                      
                      return 1; // Count this as processed
                    }
                    
                    return 0; // Already exists
                  });
                  
                  const eventCounts = await Promise.all(eventPromises);
                  return eventCounts.reduce((sum, count) => sum + count, 0);
                  
                } catch (grantError) {
                  const errorMsg = `Error processing grant ${grant._id}: ${grantError instanceof Error ? grantError.message : 'Unknown error'}`;
                  console.error(errorMsg);
                  errors.push(errorMsg);
                  return 0;
                }
              });
              
              const batchCounts = await Promise.all(grantPromises);
              processedCount += batchCounts.reduce((sum, count) => sum + count, 0);
              
              // Brief pause to prevent overwhelming the database
              if (grantBatch.length >= grantBatchSize) {
                await new Promise(resolve => setTimeout(resolve, 10));
              }
            }
            
          } catch (userError) {
            const errorMsg = `Error processing user ${user._id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }
        
        // Progress update
        console.log(`Processed ${Math.min(i + userBatchSize, allUsers.length)}/${allUsers.length} users`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`Vesting calculations completed. Processed ${processedCount} events in ${duration}ms`);
      
      return {
        success: true,
        timestamp: endTime,
        message: `Processed ${processedCount} vesting events`,
        recordsProcessed: processedCount,
        errors: errors.length > 0 ? errors : undefined,
        metrics: {
          duration,
          usersProcessed: allUsers.length,
          errorsCount: errors.length,
          averageTimePerUser: allUsers.length > 0 ? duration / allUsers.length : 0,
          eventsPerSecond: duration > 0 ? (processedCount / duration) * 1000 : 0,
        },
      };
    } catch (error) {
      const errorMsg = `Fatal error in vesting calculations: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      
      return {
        success: false,
        timestamp: Date.now(),
        message: errorMsg,
        recordsProcessed: processedCount,
        errors: [...errors, errorMsg],
      };
    }
  },
});

// Helper function to calculate vesting events for a single equity grant
async function calculateVestingEvents(grant: any): Promise<VestingEventData[]> {
  // Import error handling
  const { ErrorHandler } = await import('./lib/errorHandling');
  
  // Create error handler with specific configuration for vesting calculations
  const errorHandler = new ErrorHandler({
    enableRetry: true,
    retryOptions: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true,
    },
    enableCircuitBreaker: true,
    circuitBreakerConfig: {
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds for vesting calculations
      monitoringPeriod: 300000,
    },
    enableAuditLogging: true,
  });
  
  const context = {
    operationType: 'vesting_calculation',
    grantId: grant._id,
    userId: grant.userId,
  };
  
  try {
    return await errorHandler.executeWithErrorHandling(async () => {
      // Import services
      const { ServerDecryptionService } = await import('./lib/serverDecryption');
      const { VestingEngine } = await import('./lib/vestingEngine');
      
      // Decrypt the equity grant data with error handling
      const decryptionResult = await ServerDecryptionService.decryptEquityData(
        grant.encryptedData,
        {
          auditContext: {
            userId: grant.userId,
            operation: 'vesting_calculation',
            grantId: grant._id,
          },
        }
      );
      
      if (!decryptionResult.success) {
        const { VestingCalculationError } = await import('./types/equity');
        throw new VestingCalculationError(
          `Failed to decrypt equity data: ${decryptionResult.error}`,
          'DECRYPTION_FAILED',
          grant._id
        );
      }
      
      // Parse and validate the decrypted equity data
      let equityData;
      try {
        equityData = JSON.parse(decryptionResult.data!);
      } catch (parseError) {
        const { VestingCalculationError } = await import('./types/equity');
        throw new VestingCalculationError(
          'Failed to parse decrypted equity data as JSON',
          'INVALID_GRANT_DATA',
          grant._id
        );
      }
      
      // Validate required fields
      const requiredFields = ['company', 'type', 'shares', 'grantDate', 'vestingStart', 'vestingPeriod', 'vestingFrequency'];
      const missingFields = requiredFields.filter(field => !equityData[field]);
      if (missingFields.length > 0) {
        const { VestingCalculationError } = await import('./types/equity');
        throw new VestingCalculationError(
          `Missing required fields in equity data: ${missingFields.join(', ')}`,
          'INVALID_GRANT_DATA',
          grant._id
        );
      }
      
      // Convert string dates to Date objects with validation
      const decryptedGrant = {
        ...equityData,
        grantDate: new Date(equityData.grantDate),
        vestingStart: new Date(equityData.vestingStart),
        exerciseDeadline: equityData.exerciseDeadline ? new Date(equityData.exerciseDeadline) : undefined,
        terminationDate: equityData.terminationDate ? new Date(equityData.terminationDate) : undefined,
      };
      
      // Validate dates
      if (isNaN(decryptedGrant.grantDate.getTime())) {
        const { VestingCalculationError } = await import('./types/equity');
        throw new VestingCalculationError(
          'Invalid grant date in equity data',
          'INVALID_DATES',
          grant._id
        );
      }
      
      if (isNaN(decryptedGrant.vestingStart.getTime())) {
        const { VestingCalculationError } = await import('./types/equity');
        throw new VestingCalculationError(
          'Invalid vesting start date in equity data',
          'INVALID_DATES',
          grant._id
        );
      }
      
      // Create vesting engine instance with timeout
      const vestingEngine = new VestingEngine();
      
      // Set timeout for calculation to prevent hanging
      const calculationTimeout = 30000; // 30 seconds
      const calculationPromise = vestingEngine.calculateVesting({
        grant: decryptedGrant,
        calculationDate: new Date(),
        includeAcceleration: true,
        includePerformance: true,
      });
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const { VestingCalculationError } = import('./types/equity').then(({ VestingCalculationError }) => {
            reject(new VestingCalculationError(
              'Vesting calculation timed out',
              'PERFORMANCE_TIMEOUT',
              grant._id
            ));
          });
        }, calculationTimeout);
      });
      
      const calculationResult = await Promise.race([calculationPromise, timeoutPromise]);
      
      if (!calculationResult.success) {
        const { VestingCalculationError } = await import('./types/equity');
        throw new VestingCalculationError(
          `Vesting calculation failed: ${calculationResult.error}`,
          'CALCULATION_FAILED',
          grant._id
        );
      }
      
      // Validate calculation results
      if (!calculationResult.events || calculationResult.events.length === 0) {
        console.warn(`No vesting events calculated for grant ${grant._id}, but calculation succeeded`);
      }
      
      // Convert to the expected format with additional validation
      const vestingEvents: VestingEventData[] = calculationResult.events.map((event, index) => {
        if (!event.vestingDate || !event.sharesVested || !event.grantType || !event.companyName) {
          const { VestingCalculationError } = import('./types/equity').then(({ VestingCalculationError }) => {
            throw new VestingCalculationError(
              `Invalid vesting event at index ${index}`,
              'CALCULATION_FAILED',
              grant._id
            );
          });
        }
        
        return {
          vestingDate: event.vestingDate,
          sharesVested: event.sharesVested,
          grantType: event.grantType,
          companyName: event.companyName,
        };
      });
      
      console.log(`Successfully calculated ${vestingEvents.length} vesting events for grant ${grant._id}`);
      return vestingEvents;
    }, context);
    
  } catch (error) {
    // This is the final fallback - error handler has already tried retries
    console.error(`Final error calculating vesting events for grant ${grant._id}:`, error);
    
    // Return empty array to prevent the entire batch from failing
    // In production, you might want to flag this grant for manual review
    return [];
  }
}

// Type definition for vesting event data
interface VestingEventData {
  vestingDate: number;
  sharesVested: number;
  grantType: 'ISO' | 'NSO' | 'RSU' | 'ESPP';
  companyName: string;
}

// Query to get vesting events for a user
export const getVestingEvents = query({
  args: {
    userId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query('vestingEvents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId));
    
    if (args.startDate && args.endDate) {
      query = query.filter((q) => 
        q.gte(q.field('vestingDate'), args.startDate!) &&
        q.lte(q.field('vestingDate'), args.endDate!)
      );
    }
    
    return await query
      .order('desc')
      .collect();
  },
});

// Query to get upcoming vesting events (for notifications)
export const getUpcomingVestingEvents = query({
  args: {
    userId: v.string(),
    daysAhead: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const futureDate = now + (args.daysAhead * 24 * 60 * 60 * 1000);
    
    return await ctx.db
      .query('vestingEvents')
      .withIndex('by_upcoming_vests', (q: any) => 
        q.eq('userId', args.userId)
         .gte('vestingDate', now)
         .lte('vestingDate', futureDate)
         .eq('processed', false)
      )
      .order('desc')
      .collect();
  },
});

// Mutation to mark vesting events as processed
export const markVestingEventsProcessed = mutation({
  args: {
    eventIds: v.array(v.id('vestingEvents')),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = [];
    
    for (const eventId of args.eventIds) {
      const result = await ctx.db.patch(eventId, {
        processed: true,
        processedAt: now,
        updatedAt: now,
      });
      results.push(result);
    }
    
    return results;
  },
});

// Internal query to get all equity grants that need vesting calculations
export const getEquityGrantsForCalculation = internalQuery({
  handler: async (ctx) => {
    return await ctx.db
      .query('compensationRecords')
      .filter((q) => q.eq(q.field('type'), 'equity'))
      .collect();
  },
});

// Utility function to calculate vesting schedule (would be expanded with full logic)
export function calculateVestingSchedule(
  grantDate: Date,
  vestingStart: Date,
  vestingCliff: number = 0, // months
  vestingPeriod: number = 48, // months
  vestingFrequency: 'monthly' | 'quarterly' | 'annual' = 'monthly',
  totalShares: number
): VestingEventData[] {
  const events: VestingEventData[] = [];
  
  // Calculate cliff date
  const cliffDate = vestingCliff > 0 ? addMonths(vestingStart, vestingCliff) : vestingStart;
  
  // Calculate vesting frequency in months
  const frequencyMonths = vestingFrequency === 'monthly' ? 1 : 
                         vestingFrequency === 'quarterly' ? 3 : 12;
  
  // Calculate shares per vesting period
  const periodsInVesting = vestingPeriod / frequencyMonths;
  const sharesPerPeriod = totalShares / periodsInVesting;
  
  // Generate vesting events
  let currentDate = cliffDate;
  const endDate = addMonths(vestingStart, vestingPeriod);
  
  while (isBefore(currentDate, endDate) || currentDate.getTime() === endDate.getTime()) {
    // Calculate shares for this period
    let sharesThisPeriod = sharesPerPeriod;
    
    // Handle cliff vesting (if applicable)
    if (currentDate.getTime() === cliffDate.getTime() && vestingCliff > 0) {
      // Cliff vesting includes all shares up to the cliff date
      const cliffPeriods = vestingCliff / frequencyMonths;
      sharesThisPeriod = sharesPerPeriod * cliffPeriods;
    }
    
    events.push({
      vestingDate: startOfDay(currentDate).getTime(),
      sharesVested: Math.round(sharesThisPeriod),
      grantType: 'RSU', // This would come from the actual grant data
      companyName: 'TBD', // This would come from the actual grant data
    });
    
    // Move to next vesting period
    currentDate = addMonths(currentDate, frequencyMonths);
  }
  
  return events;
}

// Mutation to manually trigger vesting calculations for a specific user
export const triggerVestingCalculationForUser = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    let processedCount = 0;
    let errors: string[] = [];
    
    try {
      // Get all equity grants for this specific user
      const equityGrants = await ctx.db
        .query('compensationRecords')
        .withIndex('by_user_and_type', (q) => 
          q.eq('userId', args.userId).eq('type', 'equity')
        )
        .collect();
      
      if (equityGrants.length === 0) {
        return {
          success: true,
          message: `No equity grants found for user ${args.userId}`,
          timestamp: Date.now(),
          recordsProcessed: 0,
        };
      }
      
      console.log(`Processing ${equityGrants.length} equity grants for user ${args.userId}`);
      
      // Process each grant
      for (const grant of equityGrants) {
        try {
          const vestingEvents = await calculateVestingEvents(grant);
          
          for (const event of vestingEvents) {
            // Check if this vesting event already exists
            const existingEvent = await ctx.db
              .query('vestingEvents')
              .withIndex('by_equity_grant', (q) => q.eq('equityGrantId', grant._id))
              .filter((q) => q.eq(q.field('vestingDate'), event.vestingDate))
              .first();
            
            if (!existingEvent) {
              // Create new vesting event
              await ctx.db.insert('vestingEvents', {
                userId: args.userId,
                equityGrantId: grant._id,
                vestingDate: event.vestingDate,
                sharesVested: event.sharesVested,
                calculatedAt: Date.now(),
                grantType: event.grantType,
                companyName: event.companyName,
                processed: false,
                calculationSource: 'manual' as const,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
              
              processedCount++;
            }
          }
        } catch (grantError) {
          const errorMsg = `Error processing grant ${grant._id}: ${grantError instanceof Error ? grantError.message : 'Unknown error'}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      return {
        success: true,
        message: `Processed ${processedCount} vesting events for user ${args.userId}`,
        timestamp: endTime,
        recordsProcessed: processedCount,
        errors: errors.length > 0 ? errors : undefined,
        metrics: {
          duration,
          grantsProcessed: equityGrants.length,
          errorsCount: errors.length,
        },
      };
      
    } catch (error) {
      const errorMsg = `Fatal error processing user ${args.userId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      
      return {
        success: false,
        message: errorMsg,
        timestamp: Date.now(),
        recordsProcessed: processedCount,
        errors: [...errors, errorMsg],
      };
    }
  },
});

// Internal mutation to run comprehensive tests (for development/validation)
export const runVestingCalculationTests = mutation({
  args: {},
  handler: async (ctx) => {
    console.log('Running comprehensive vesting calculation tests...');
    
    try {
      const { VestingCalculationTester } = await import('./lib/testVestingCalculations');
      const tester = new VestingCalculationTester();
      
      const testSuites = await tester.runAllTests();
      
      const summary = {
        totalSuites: testSuites.length,
        totalTests: testSuites.reduce((sum, suite) => sum + suite.totalTests, 0),
        totalPassed: testSuites.reduce((sum, suite) => sum + suite.passedTests, 0),
        totalFailed: testSuites.reduce((sum, suite) => sum + suite.failedTests, 0),
        totalDuration: testSuites.reduce((sum, suite) => sum + suite.totalDuration, 0),
        suiteResults: testSuites.map(suite => ({
          name: suite.suiteName,
          passed: suite.passedTests,
          failed: suite.failedTests,
          total: suite.totalTests,
          duration: suite.totalDuration,
        })),
      };
      
      const successRate = (summary.totalPassed / summary.totalTests) * 100;
      
      console.log(`Tests completed: ${summary.totalPassed}/${summary.totalTests} passed (${successRate.toFixed(1)}%)`);
      
      return {
        success: true,
        message: `Tests completed with ${successRate.toFixed(1)}% success rate`,
        timestamp: Date.now(),
        summary,
        allTestsPassed: summary.totalFailed === 0,
      };
      
    } catch (error) {
      const errorMsg = `Test execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      
      return {
        success: false,
        message: errorMsg,
        timestamp: Date.now(),
      };
    }
  },
});

// Query to get vesting calculation health and performance metrics
export const getVestingCalculationHealth = query({
  args: {},
  handler: async (ctx) => {
    try {
      // Get recent calculation statistics
      const recentVestingEvents = await ctx.db
        .query('vestingEvents')
        .withIndex('by_vesting_date', (q) => 
          q.gte('calculatedAt', Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        )
        .collect();
      
      const totalEquityGrants = await ctx.db
        .query('compensationRecords')
        .filter((q) => q.eq(q.field('type'), 'equity'))
        .collect();
      
      // Import error handling to get statistics
      const { ErrorHandler } = await import('./lib/errorHandling');
      const errorStats = ErrorHandler.getErrorStats();
      
      // Import server decryption to get statistics
      const { ServerDecryptionService } = await import('./lib/serverDecryption');
      const decryptionStats = ServerDecryptionService.getDecryptionStats();
      
      return {
        timestamp: Date.now(),
        vestingEvents: {
          recentCalculations: recentVestingEvents.length,
          totalEquityGrants: totalEquityGrants.length,
          calculationCoverage: totalEquityGrants.length > 0 ? 
            (recentVestingEvents.length / totalEquityGrants.length) * 100 : 0,
        },
        errorStats: {
          totalErrors: errorStats.totalErrors,
          recentErrors: errorStats.recentErrors,
          dailyErrors: errorStats.dailyErrors,
          errorsByCode: errorStats.errorsByCode,
          circuitBreakerStats: errorStats.circuitBreakerStats,
        },
        decryptionStats: {
          totalAttempts: decryptionStats.totalAttempts,
          successfulDecryptions: decryptionStats.successfulDecryptions,
          failedDecryptions: decryptionStats.failedDecryptions,
          successRate: decryptionStats.successRate,
          recentErrors: decryptionStats.recentErrors.slice(0, 5), // Last 5 errors
        },
        healthScore: this.calculateHealthScore(errorStats, decryptionStats, recentVestingEvents.length),
      };
      
    } catch (error) {
      console.error('Error getting vesting calculation health:', error);
      return {
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
        healthScore: 0,
      };
    }
  },
});

// Helper function to calculate overall health score
function calculateHealthScore(errorStats: any, decryptionStats: any, recentCalculations: number): number {
  let score = 100;
  
  // Reduce score based on error rates
  if (errorStats.recentErrors > 10) score -= 20;
  else if (errorStats.recentErrors > 5) score -= 10;
  else if (errorStats.recentErrors > 0) score -= 5;
  
  // Reduce score based on decryption failures
  if (decryptionStats.successRate < 95) score -= 15;
  else if (decryptionStats.successRate < 98) score -= 10;
  else if (decryptionStats.successRate < 99) score -= 5;
  
  // Reduce score if no recent calculations (system might be down)
  if (recentCalculations === 0) score -= 30;
  
  // Check circuit breaker states
  const openCircuits = errorStats.circuitBreakerStats?.filter((cb: any) => cb.state === 'open') || [];
  if (openCircuits.length > 0) score -= 25;
  
  return Math.max(0, Math.min(100, score));
}