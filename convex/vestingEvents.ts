import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Create a new vesting event
export const createVestingEvent = mutation({
  args: {
    userId: v.string(),
    equityGrantId: v.string(),
    vestingDate: v.number(),
    sharesVested: v.number(),
    grantType: v.union(v.literal('ISO'), v.literal('NSO'), v.literal('RSU'), v.literal('ESPP')),
    companyName: v.string(),
    calculationSource: v.union(v.literal('automated'), v.literal('manual'), v.literal('corrected')),
    fmvAtVesting: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    return await ctx.db.insert('vestingEvents', {
      ...args,
      calculatedAt: now,
      processed: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update a vesting event
export const updateVestingEvent = mutation({
  args: {
    id: v.id('vestingEvents'),
    sharesVested: v.optional(v.number()),
    fmvAtVesting: v.optional(v.number()),
    processed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    
    const updateData: any = {
      ...updates,
      updatedAt: Date.now(),
    };
    
    // If marking as processed, set processedAt timestamp
    if (updates.processed === true) {
      updateData.processedAt = Date.now();
    }
    
    return await ctx.db.patch(id, updateData);
  },
});

// Delete a vesting event
export const deleteVestingEvent = mutation({
  args: {
    id: v.id('vestingEvents'),
  },
  handler: async (ctx, args) => {
    return await ctx.db.delete(args.id);
  },
});

// Get vesting events for a user
export const getVestingEventsByUser = query({
  args: {
    userId: v.string(),
    processed: v.optional(v.boolean()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query('vestingEvents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId));
    
    // Apply filters
    if (args.processed !== undefined) {
      query = query.filter((q) => q.eq(q.field('processed'), args.processed!));
    }
    
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

// Get vesting events for a specific equity grant
export const getVestingEventsByGrant = query({
  args: {
    equityGrantId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('vestingEvents')
      .withIndex('by_equity_grant', (q) => q.eq('equityGrantId', args.equityGrantId))
      .order('desc')
      .collect();
  },
});

// Get upcoming vesting events within a specified number of days
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
      .order('asc') // Order by date ascending for upcoming events
      .collect();
  },
});

// Get vesting events that occurred today (for daily processing)
export const getTodaysVestingEvents = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + (24 * 60 * 60 * 1000) - 1;
    
    let query = ctx.db
      .query('vestingEvents')
      .withIndex('by_vesting_date', (q) => 
        q.gte('vestingDate', startOfToday).lte('vestingDate', endOfToday)
      );
    
    if (args.userId) {
      query = query.filter((q) => q.eq(q.field('userId'), args.userId!));
    }
    
    return await query.collect();
  },
});

// Get vesting summary statistics for a user
export const getVestingSummary = query({
  args: {
    userId: v.string(),
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query('vestingEvents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId));
    
    // Filter by year if provided
    if (args.year) {
      const startOfYear = new Date(args.year, 0, 1).getTime();
      const endOfYear = new Date(args.year + 1, 0, 1).getTime() - 1;
      query = query.filter((q) => 
        q.gte(q.field('vestingDate'), startOfYear) &&
        q.lte(q.field('vestingDate'), endOfYear)
      );
    }
    
    const events = await query.collect();
    
    // Calculate summary statistics
    const totalEvents = events.length;
    const processedEvents = events.filter(e => e.processed).length;
    const unprocessedEvents = totalEvents - processedEvents;
    
    const totalSharesVested = events
      .filter(e => e.processed)
      .reduce((sum, e) => sum + e.sharesVested, 0);
    
    const upcomingSharesVesting = events
      .filter(e => !e.processed && e.vestingDate > Date.now())
      .reduce((sum, e) => sum + e.sharesVested, 0);
    
    // Calculate estimated value (if FMV is available)
    const totalEstimatedValue = events
      .filter(e => e.processed && e.fmvAtVesting)
      .reduce((sum, e) => sum + (e.sharesVested * (e.fmvAtVesting || 0)), 0);
    
    // Group by company
    const byCompany = events.reduce((acc, event) => {
      if (!acc[event.companyName]) {
        acc[event.companyName] = {
          totalShares: 0,
          totalEvents: 0,
          processedShares: 0,
          upcomingShares: 0,
        };
      }
      
      acc[event.companyName].totalShares += event.sharesVested;
      acc[event.companyName].totalEvents += 1;
      
      if (event.processed) {
        acc[event.companyName].processedShares += event.sharesVested;
      } else if (event.vestingDate > Date.now()) {
        acc[event.companyName].upcomingShares += event.sharesVested;
      }
      
      return acc;
    }, {} as Record<string, any>);
    
    return {
      totalEvents,
      processedEvents,
      unprocessedEvents,
      totalSharesVested,
      upcomingSharesVesting,
      totalEstimatedValue,
      byCompany,
      year: args.year,
    };
  },
});

// Bulk mark vesting events as processed
export const bulkMarkVestingEventsProcessed = mutation({
  args: {
    eventIds: v.array(v.id('vestingEvents')),
    fmvAtVesting: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = [];
    
    for (const eventId of args.eventIds) {
      const updateData: any = {
        processed: true,
        processedAt: now,
        updatedAt: now,
      };
      
      if (args.fmvAtVesting) {
        updateData.fmvAtVesting = args.fmvAtVesting;
      }
      
      const result = await ctx.db.patch(eventId, updateData);
      results.push(result);
    }
    
    return {
      success: true,
      processedCount: results.length,
      results,
    };
  },
});