import { mutation, query, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

// Create a new FMV history record
export const createFMVRecord = mutation({
  args: {
    userId: v.string(),
    companyName: v.string(),
    ticker: v.optional(v.string()),
    fmv: v.number(),
    currency: v.string(),
    effectiveDate: v.number(),
    dataSource: v.union(v.literal('manual'), v.literal('api'), v.literal('estimated')),
    apiProvider: v.optional(v.string()),
    confidence: v.optional(v.number()),
    isManualOverride: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    return await ctx.db.insert('fmvHistory', {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update an FMV record
export const updateFMVRecord = mutation({
  args: {
    id: v.id('fmvHistory'),
    fmv: v.optional(v.number()),
    confidence: v.optional(v.number()),
    notes: v.optional(v.string()),
    isManualOverride: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    
    return await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

// Get FMV history for a company
export const getFMVHistory = query({
  args: {
    userId: v.string(),
    companyName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query('fmvHistory')
      .withIndex('by_user_and_company', (q) => 
        q.eq('userId', args.userId).eq('companyName', args.companyName)
      )
      .order('desc')
      .collect();
    
    return args.limit ? results.slice(0, args.limit) : results;
  },
});

// Get current (latest) FMV for a company
export const getCurrentFMV = query({
  args: {
    userId: v.string(),
    companyName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('fmvHistory')
      .withIndex('by_user_and_company', (q) => 
        q.eq('userId', args.userId).eq('companyName', args.companyName)
      )
      .order('desc')
      .first();
  },
});

// Get FMV records by ticker symbol
export const getFMVByTicker = query({
  args: {
    ticker: v.string(),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query('fmvHistory')
      .withIndex('by_ticker', (q) => q.eq('ticker', args.ticker));
    
    if (args.userId) {
      query = query.filter((q) => q.eq(q.field('userId'), args.userId));
    }
    
    return await query
      .order('desc')
      .collect();
  },
});

// Internal mutation to process FMV updates (called by cron job)
export const processFMVUpdates = internalMutation({
  handler: async (ctx) => {
    console.log('Starting FMV updates...');
    
    const startTime = Date.now();
    let updatesProcessed = 0;
    let errors: string[] = [];
    
    try {
      // Get all unique companies and tickers that need FMV updates
      const companiesNeedingUpdates = await getCompaniesNeedingUpdates(ctx);
      
      console.log(`Found ${companiesNeedingUpdates.length} companies needing FMV updates`);
      
      for (const company of companiesNeedingUpdates) {
        try {
          // Skip if no ticker (private company)
          if (!company.ticker) {
            console.log(`Skipping ${company.companyName} - no ticker symbol`);
            continue;
          }
          
          // Check if update is needed based on last update time
          const shouldUpdate = await shouldUpdateCompanyFMV(ctx, company);
          if (!shouldUpdate) {
            console.log(`Skipping ${company.companyName} - recent update exists`);
            continue;
          }
          
          // TODO: Integrate with actual FMV API
          // For now, we'll create a mock update
          const mockFMVResult = await simulateFMVAPICall(company.ticker);
          
          if (mockFMVResult.success) {
            // Create new FMV record for each user that has this company
            const usersWithCompany = await ctx.db
              .query('fmvHistory')
              .withIndex('by_company_and_date', (q) => q.eq('companyName', company.companyName))
              .collect();
            
            const uniqueUsers = [...new Set(usersWithCompany.map(record => record.userId))];
            
            for (const userId of uniqueUsers) {
              await ctx.db.insert('fmvHistory', {
                userId,
                companyName: company.companyName,
                ticker: company.ticker,
                fmv: mockFMVResult.fmv!,
                currency: 'USD',
                effectiveDate: Date.now(),
                dataSource: 'api' as const,
                apiProvider: mockFMVResult.source,
                confidence: mockFMVResult.confidence,
                isManualOverride: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
            }
            
            updatesProcessed++;
            console.log(`Updated FMV for ${company.companyName}: $${mockFMVResult.fmv}`);
            
            // Create notifications for significant price changes
            if (mockFMVResult.success && mockFMVResult.fmv !== undefined) {
              await createFMVUpdateNotifications(ctx, company, {
                fmv: mockFMVResult.fmv,
                source: mockFMVResult.source,
                confidence: mockFMVResult.confidence,
              });
            }
            
          } else {
            console.error(`Failed to update FMV for ${company.companyName}: ${mockFMVResult.error}`);
            errors.push(`${company.companyName}: ${mockFMVResult.error}`);
          }
          
        } catch (companyError) {
          const errorMsg = `Error updating ${company.companyName}: ${companyError instanceof Error ? companyError.message : 'Unknown error'}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`FMV updates completed. Processed ${updatesProcessed} companies in ${duration}ms`);
      
      return {
        success: true,
        timestamp: endTime,
        message: `Processed FMV updates for ${updatesProcessed} companies`,
        recordsProcessed: updatesProcessed,
        errors: errors.length > 0 ? errors : undefined,
        metrics: {
          duration,
          companiesChecked: companiesNeedingUpdates.length,
          errorsCount: errors.length,
        },
      };
      
    } catch (error) {
      const errorMsg = `Fatal error in FMV updates: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      
      return {
        success: false,
        timestamp: Date.now(),
        message: errorMsg,
        recordsProcessed: updatesProcessed,
        errors: [...errors, errorMsg],
      };
    }
  },
});

// Helper function to get companies needing FMV updates
async function getCompaniesNeedingUpdates(ctx: any): Promise<Array<{ companyName: string; ticker?: string }>> {
  const allFMVRecords = await ctx.db.query('fmvHistory').collect();
  
  // Group by company and get the latest record for each
  const companiesMap = new Map<string, any>();
  
  for (const record of allFMVRecords) {
    const existing = companiesMap.get(record.companyName);
    if (!existing || record.effectiveDate > existing.effectiveDate) {
      companiesMap.set(record.companyName, record);
    }
  }
  
  return Array.from(companiesMap.values())
    .filter(record => record.ticker) // Only public companies with tickers
    .map(record => ({
      companyName: record.companyName,
      ticker: record.ticker,
    }));
}

// Helper function to check if company needs FMV update
async function shouldUpdateCompanyFMV(ctx: any, company: { companyName: string; ticker?: string }): Promise<boolean> {
  const latestRecord = await ctx.db
    .query('fmvHistory')
    .withIndex('by_company_and_date', (q: any) => q.eq('companyName', company.companyName))
    .order('desc')
    .first();
  
  if (!latestRecord) {
    return true; // No record exists, definitely need update
  }
  
  const now = Date.now();
  const timeSinceUpdate = now - latestRecord.effectiveDate;
  const hoursSinceUpdate = timeSinceUpdate / (1000 * 60 * 60);
  
  // Update if more than 24 hours old
  if (hoursSinceUpdate > 24) {
    return true;
  }
  
  // Update more frequently for low confidence data
  if (latestRecord.confidence && latestRecord.confidence < 0.7 && hoursSinceUpdate > 4) {
    return true;
  }
  
  // Don't update if manually overridden recently
  if (latestRecord.isManualOverride && hoursSinceUpdate < 24) {
    return false;
  }
  
  return false;
}

// Mock FMV API call (replace with actual API integration)
async function simulateFMVAPICall(ticker: string): Promise<{
  success: boolean;
  fmv?: number;
  source: string;
  confidence: number;
  error?: string;
}> {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Mock response - in real implementation, this would call the FMV service
  const mockPrices: Record<string, number> = {
    'AAPL': 175.50,
    'GOOGL': 135.25,
    'MSFT': 378.20,
    'TSLA': 245.80,
    'META': 312.40,
  };
  
  const baseFMV = mockPrices[ticker] || 100 + Math.random() * 200;
  const variation = (Math.random() - 0.5) * 0.1; // ±5% variation
  const fmv = baseFMV * (1 + variation);
  
  return {
    success: true,
    fmv: Math.round(fmv * 100) / 100, // Round to 2 decimal places
    source: 'mock_api',
    confidence: 0.85,
  };
}

// Helper function to create FMV update notifications
async function createFMVUpdateNotifications(
  ctx: any,
  company: { companyName: string; ticker?: string },
  fmvResult: { fmv: number; source: string; confidence: number }
): Promise<void> {
  // Get previous FMV to calculate change
  const previousRecord = await ctx.db
    .query('fmvHistory')
    .withIndex('by_company_and_date', (q: any) => q.eq('companyName', company.companyName))
    .order('desc')
    .filter((q: any) => q.neq(q.field('effectiveDate'), Date.now()))
    .first();
  
  if (!previousRecord) {
    return; // No previous record to compare against
  }
  
  const currentFMV = fmvResult.fmv;
  const previousFMV = previousRecord.fmv;
  const changePercent = Math.abs((currentFMV - previousFMV) / previousFMV) * 100;
  
  // Only create notification for significant changes (>5%)
  if (changePercent < 5) {
    return;
  }
  
  // Get users who have this company in their portfolio
  const usersWithCompany = await ctx.db
    .query('fmvHistory')
    .withIndex('by_company_and_date', (q: any) => q.eq('companyName', company.companyName))
    .collect();
  
  const uniqueUsers = [...new Set(usersWithCompany.map((record: any) => record.userId))];
  
  const direction = currentFMV > previousFMV ? 'increased' : 'decreased';
  const emoji = currentFMV > previousFMV ? '📈' : '📉';
  
  for (const userId of uniqueUsers) {
    // Check if user wants FMV update notifications
    const userPrefs = await ctx.db
      .query('userPreferences')
      .withIndex('by_user', (q: any) => q.eq('userId', userId))
      .first();
    
    if (userPrefs && !userPrefs.notificationSettings.fmvUpdates.enabled) {
      continue; // User has disabled FMV notifications
    }
    
    const deliveryMethods = userPrefs?.notificationSettings.fmvUpdates.methods || ['in_app'];
    
    const title = `${emoji} FMV Updated - ${company.companyName}`;
    const message = `${company.companyName} FMV ${direction} to $${currentFMV.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%)`;
    
    await ctx.db.insert('notifications', {
      userId,
      type: 'fmv_updated' as const,
      title,
      message,
      relatedEntityId: company.companyName,
      relatedEntityType: 'fmv_update' as const,
      scheduledFor: Date.now(), // Send immediately
      deliveryMethods,
      status: 'pending' as const,
      attempts: 0,
      emailSent: false,
      inAppSent: false,
      pushSent: false,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
}

// Get FMV statistics for a user
export const getFMVStats = query({
  args: {
    userId: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query('fmvHistory')
      .withIndex('by_user', (q) => q.eq('userId', args.userId));
    
    let records = await query.collect();
    
    // Filter by date range if provided
    if (args.startDate && args.endDate) {
      records = records.filter(r => 
        r.effectiveDate >= args.startDate! && r.effectiveDate <= args.endDate!
      );
    }
    
    // Group by company to get latest FMV for each
    const latestByCompany = new Map<string, any>();
    for (const record of records) {
      const existing = latestByCompany.get(record.companyName);
      if (!existing || record.effectiveDate > existing.effectiveDate) {
        latestByCompany.set(record.companyName, record);
      }
    }
    
    const totalCompanies = latestByCompany.size;
    const publicCompanies = Array.from(latestByCompany.values()).filter(r => r.ticker).length;
    const privateCompanies = totalCompanies - publicCompanies;
    
    // Calculate average confidence
    const totalConfidence = Array.from(latestByCompany.values())
      .reduce((sum, r) => sum + (r.confidence || 0), 0);
    const averageConfidence = totalCompanies > 0 ? totalConfidence / totalCompanies : 0;
    
    // Count by data source
    const byDataSource = Array.from(latestByCompany.values())
      .reduce((acc, record) => {
        acc[record.dataSource] = (acc[record.dataSource] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    return {
      totalCompanies,
      publicCompanies,
      privateCompanies,
      averageConfidence,
      byDataSource,
      lastUpdateTime: Math.max(...Array.from(latestByCompany.values()).map(r => r.effectiveDate)),
    };
  },
});

// Delete old FMV records (keep only latest 10 per company per user)
export const cleanupOldFMVRecords = mutation({
  args: {
    userId: v.string(),
    keepRecordsPerCompany: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const keepCount = args.keepRecordsPerCompany || 10;
    
    // Get all FMV records for user
    const allRecords = await ctx.db
      .query('fmvHistory')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    
    // Group by company
    const recordsByCompany = allRecords.reduce((acc, record) => {
      if (!acc[record.companyName]) {
        acc[record.companyName] = [];
      }
      acc[record.companyName].push(record);
      return acc;
    }, {} as Record<string, any[]>);
    
    let deletedCount = 0;
    
    // For each company, keep only the latest N records
    for (const [companyName, records] of Object.entries(recordsByCompany)) {
      // Sort by effective date (newest first)
      records.sort((a, b) => b.effectiveDate - a.effectiveDate);
      
      // Delete old records (keep first N)
      const recordsToDelete = records.slice(keepCount);
      
      for (const record of recordsToDelete) {
        await ctx.db.delete(record._id);
        deletedCount++;
      }
    }
    
    return {
      deletedCount,
      companiesProcessed: Object.keys(recordsByCompany).length,
    };
  },
});