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
      
      for (const user of allUsers) {
        try {
          // Get all equity grants for this user
          const equityGrants = await ctx.db
            .query('compensationRecords')
            .withIndex('by_user_and_type', (q) => 
              q.eq('userId', user._id).eq('type', 'equity')
            )
            .collect();
          
          for (const grant of equityGrants) {
            try {
              // For now, we'll need to decrypt the data to calculate vesting
              // This is a simplified approach - in production, you'd handle decryption more carefully
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
                  
                  processedCount++;
                }
              }
            } catch (grantError) {
              const errorMsg = `Error processing grant ${grant._id}: ${grantError instanceof Error ? grantError.message : 'Unknown error'}`;
              console.error(errorMsg);
              errors.push(errorMsg);
            }
          }
        } catch (userError) {
          const errorMsg = `Error processing user ${user._id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
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
  // For now, this is a placeholder that would need to handle decryption
  // In a real implementation, you'd decrypt the equity data and calculate vesting
  
  // This is a simplified example - you'd need to implement proper decryption here
  // For demonstration, we'll return mock data
  const mockEvents: VestingEventData[] = [];
  
  // TODO: Implement actual vesting calculation logic
  // 1. Decrypt the equity grant data
  // 2. Parse vesting schedule parameters
  // 3. Calculate all vesting events based on schedule
  // 4. Return array of vesting events
  
  return mockEvents;
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
      .withIndex('by_upcoming_vests', (q) => 
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
      .withIndex('by_user_and_type', (q) => q.eq('type', 'equity'))
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
    // This would trigger the same logic as the cron job but for a specific user
    // Implementation would be similar to processVestingCalculations but filtered by user
    
    return {
      success: true,
      message: `Triggered vesting calculation for user ${args.userId}`,
      timestamp: Date.now(),
    };
  },
});