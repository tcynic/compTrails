import { mutation, query, internalMutation, internalQuery, internalAction } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

// Create a new FMV history record (public)
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

// Internal version for creating FMV records from cron jobs
export const createFMVRecordInternal = internalMutation({
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

// Internal action to process FMV updates (called by cron job)
export const processFMVUpdates = internalAction({
  handler: async (ctx): Promise<{
    success: boolean;
    timestamp: number;
    message: string;
    recordsProcessed: number;
    errors?: string[];
    metrics?: {
      duration: number;
      companiesChecked: number;
      errorsCount: number;
    };
  }> => {
    console.log('Starting FMV updates...');
    
    const startTime = Date.now();
    let updatesProcessed = 0;
    let errors: string[] = [];
    
    try {
      // Get all unique companies and tickers that need FMV updates
      const companiesNeedingUpdates = await ctx.runQuery(internal.fmvUpdates.getCompaniesNeedingUpdates);
      
      console.log(`Found ${companiesNeedingUpdates.length} companies needing FMV updates`);
      
      for (const company of companiesNeedingUpdates) {
        try {
          // Handle private companies (no ticker) differently
          if (!company.ticker) {
            console.log(`Processing private company: ${company.companyName}`);
            const privateCompanyResult = await ctx.runMutation(internal.fmvUpdates.processPrivateCompanyFMV, {
              companyName: company.companyName,
            });
            
            if (privateCompanyResult.updated) {
              updatesProcessed++;
              console.log(`Updated private company FMV for ${company.companyName}`);
            } else {
              console.log(`No FMV update needed for private company ${company.companyName}: ${privateCompanyResult.reason}`);
            }
            continue;
          }
          
          // Check if update is needed based on last update time
          const shouldUpdate = await ctx.runQuery(internal.fmvUpdates.shouldUpdateCompanyFMV, {
            companyName: company.companyName,
            ticker: company.ticker,
          });
          if (!shouldUpdate) {
            console.log(`Skipping ${company.companyName} - recent update exists`);
            continue;
          }
          
          // Call the real FMV API action
          const fmvResult = await ctx.runAction(internal.fmvApi.fetchFMV, {
            ticker: company.ticker,
            useCache: true,
            forceFresh: false,
          });
          
          if (fmvResult.success) {
            // Create new FMV record for each user that has this company
            const usersWithCompany = await ctx.runQuery(internal.fmvUpdates.getUsersWithCompany, {
              companyName: company.companyName,
            });
            
            const uniqueUsers = [...new Set(usersWithCompany.map(record => record.userId))];
            
            for (const userId of uniqueUsers) {
              await ctx.runMutation(internal.fmvUpdates.createFMVRecordInternal, {
                userId,
                companyName: company.companyName,
                ticker: company.ticker,
                fmv: fmvResult.fmv!,
                currency: 'USD',
                effectiveDate: Date.now(),
                dataSource: 'api' as const,
                apiProvider: fmvResult.source,
                confidence: fmvResult.confidence,
                isManualOverride: false,
              });
            }
            
            updatesProcessed++;
            console.log(`Updated FMV for ${company.companyName}: $${fmvResult.fmv}`);
            
            // Create notifications for significant price changes
            if (fmvResult.success && fmvResult.fmv !== undefined) {
              await ctx.runMutation(internal.fmvUpdates.createFMVUpdateNotifications, {
                companyName: company.companyName,
                ticker: company.ticker,
                fmvResult: {
                  fmv: fmvResult.fmv,
                  source: fmvResult.source,
                  confidence: fmvResult.confidence,
                },
              });
            }
            
          } else {
            console.error(`Failed to update FMV for ${company.companyName}: ${fmvResult.error}`);
            errors.push(`${company.companyName}: ${fmvResult.error}`);
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

// Internal query to get companies needing FMV updates
export const getCompaniesNeedingUpdates = internalQuery({
  handler: async (ctx): Promise<Array<{ companyName: string; ticker?: string }>> => {
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
      .map(record => ({
        companyName: record.companyName,
        ticker: record.ticker, // Will be undefined for private companies
      }));
  },
});

// Internal query to check if company needs FMV update
export const shouldUpdateCompanyFMV = internalQuery({
  args: {
    companyName: v.string(),
    ticker: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const latestRecord = await ctx.db
      .query('fmvHistory')
      .withIndex('by_company_and_date', (q) => q.eq('companyName', args.companyName))
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
  },
});

// Internal query to get users with a specific company
export const getUsersWithCompany = internalQuery({
  args: {
    companyName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('fmvHistory')
      .withIndex('by_company_and_date', (q) => q.eq('companyName', args.companyName))
      .collect();
  },
});

// Internal mutation to create FMV update notifications
export const createFMVUpdateNotifications = internalMutation({
  args: {
    companyName: v.string(),
    ticker: v.optional(v.string()),
    fmvResult: v.object({
      fmv: v.number(),
      source: v.string(),
      confidence: v.number(),
    }),
  },
  handler: async (ctx, args): Promise<void> => {
    // Get previous FMV to calculate change
    const previousRecord = await ctx.db
      .query('fmvHistory')
      .withIndex('by_company_and_date', (q) => q.eq('companyName', args.companyName))
      .order('desc')
      .filter((q) => q.neq(q.field('effectiveDate'), Date.now()))
      .first();
    
    if (!previousRecord) {
      return; // No previous record to compare against
    }
    
    const currentFMV = args.fmvResult.fmv;
    const previousFMV = previousRecord.fmv;
    const changePercent = Math.abs((currentFMV - previousFMV) / previousFMV) * 100;
    
    // Only create notification for significant changes (>5%)
    if (changePercent < 5) {
      return;
    }
    
    // Get users who have this company in their portfolio
    const usersWithCompany = await ctx.db
      .query('fmvHistory')
      .withIndex('by_company_and_date', (q) => q.eq('companyName', args.companyName))
      .collect();
    
    const uniqueUsers = [...new Set(usersWithCompany.map((record: any) => record.userId))];
    
    const direction = currentFMV > previousFMV ? 'increased' : 'decreased';
    const emoji = currentFMV > previousFMV ? '📈' : '📉';
    
    for (const userId of uniqueUsers) {
      // Check if user wants FMV update notifications
      const userPrefs = await ctx.db
        .query('userPreferences')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .first();
      
      if (userPrefs && !userPrefs.notificationSettings.fmvUpdates.enabled) {
        continue; // User has disabled FMV notifications
      }
      
      const deliveryMethods = userPrefs?.notificationSettings.fmvUpdates.methods || ['in_app'];
      
      const title = `${emoji} FMV Updated - ${args.companyName}`;
      const message = `${args.companyName} FMV ${direction} to $${currentFMV.toFixed(2)} (${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%)`;
      
      await ctx.db.insert('notifications', {
        userId,
        type: 'fmv_updated' as const,
        title,
        message,
        relatedEntityId: args.companyName,
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
  },
});

// Internal mutation to process private company FMV updates
export const processPrivateCompanyFMV = internalMutation({
  args: {
    companyName: v.string(),
  },
  handler: async (ctx, args): Promise<{ updated: boolean; reason: string }> => {
    try {
      // Get the latest FMV record for this private company
      const latestRecord = await ctx.db
        .query('fmvHistory')
        .withIndex('by_company_and_date', (q) => q.eq('companyName', args.companyName))
        .order('desc')
        .first();
      
      if (!latestRecord) {
        return { updated: false, reason: 'No existing FMV records found' };
      }
      
      // Check if we should attempt an estimation update
      const now = Date.now();
      const timeSinceUpdate = now - latestRecord.effectiveDate;
      const daysSinceUpdate = timeSinceUpdate / (1000 * 60 * 60 * 24);
      
      // For private companies, only update if:
      // 1. Last update was manual and older than 90 days
      // 2. Last update was estimated and older than 30 days
      // 3. Manual override is not recent (< 7 days)
      
      if (latestRecord.isManualOverride && daysSinceUpdate < 7) {
        return { updated: false, reason: 'Recent manual override' };
      }
      
      const shouldUpdate = 
        (latestRecord.dataSource === 'manual' && daysSinceUpdate > 90) ||
        (latestRecord.dataSource === 'estimated' && daysSinceUpdate > 30);
      
      if (!shouldUpdate) {
        return { updated: false, reason: `Too recent (${daysSinceUpdate.toFixed(1)} days ago)` };
      }
      
      // Try to generate an estimated FMV using available methods
      const estimatedFMV = await generatePrivateCompanyEstimate(ctx, args.companyName, latestRecord);
      
      if (!estimatedFMV) {
        return { updated: false, reason: 'Unable to generate estimate' };
      }
      
      // Get users who have this company in their portfolio
      const usersWithCompany = await ctx.db
        .query('fmvHistory')
        .withIndex('by_company_and_date', (q) => q.eq('companyName', args.companyName))
        .collect();
      
      const uniqueUsers = [...new Set(usersWithCompany.map(record => record.userId))];
      
      // Create new estimated FMV record for each user
      for (const userId of uniqueUsers) {
        await ctx.db.insert('fmvHistory', {
          userId,
          companyName: args.companyName,
          ticker: undefined,
          fmv: estimatedFMV.value,
          currency: 'USD',
          effectiveDate: now,
          dataSource: 'estimated' as const,
          apiProvider: undefined,
          confidence: estimatedFMV.confidence,
          isManualOverride: false,
          notes: estimatedFMV.methodology,
          createdAt: now,
          updatedAt: now,
        });
      }
      
      return { updated: true, reason: `Updated using ${estimatedFMV.methodology}` };
      
    } catch (error) {
      console.error(`Error processing private company ${args.companyName}:`, error);
      return { updated: false, reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  },
});

// Helper function to generate private company FMV estimates
async function generatePrivateCompanyEstimate(
  ctx: any, 
  companyName: string, 
  latestRecord: any
): Promise<{ value: number; confidence: number; methodology: string } | null> {
  
  // Method 1: Inflation adjustment of last known value
  if (latestRecord.dataSource === 'manual') {
    const now = Date.now();
    const yearsElapsed = (now - latestRecord.effectiveDate) / (1000 * 60 * 60 * 24 * 365);
    
    // Apply conservative inflation rate of 3% annually
    const inflationRate = 0.03;
    const inflatedValue = latestRecord.fmv * Math.pow(1 + inflationRate, yearsElapsed);
    
    return {
      value: Math.round(inflatedValue * 100) / 100,
      confidence: Math.max(0.3, 0.8 - (yearsElapsed * 0.1)), // Confidence decreases over time
      methodology: `Inflation-adjusted from manual entry (${yearsElapsed.toFixed(1)} years, ${(inflationRate * 100)}% annual rate)`
    };
  }
  
  // Method 2: Industry multiple estimation (placeholder for future implementation)
  if (companyName.toLowerCase().includes('tech') || companyName.toLowerCase().includes('software')) {
    // Tech companies often trade at higher multiples
    const techMultiplier = 1.15;
    const adjustedValue = latestRecord.fmv * techMultiplier;
    
    return {
      value: Math.round(adjustedValue * 100) / 100,
      confidence: 0.4,
      methodology: 'Industry multiple estimation (tech sector +15%)'
    };
  }
  
  // Method 3: Conservative growth estimation
  const years = (Date.now() - latestRecord.effectiveDate) / (1000 * 60 * 60 * 24 * 365);
  if (years > 0.25) { // Only if it's been at least 3 months
    const conservativeGrowthRate = 0.05; // 5% annual growth
    const grownValue = latestRecord.fmv * Math.pow(1 + conservativeGrowthRate, years);
    
    return {
      value: Math.round(grownValue * 100) / 100,
      confidence: Math.max(0.25, 0.6 - (years * 0.05)),
      methodology: `Conservative growth estimation (${(conservativeGrowthRate * 100)}% annual)`
    };
  }
  
  return null; // No estimation method available
}

// Create a manual FMV record for private companies
export const createManualPrivateFMV = mutation({
  args: {
    userId: v.string(),
    companyName: v.string(),
    fmv: v.number(),
    currency: v.string(),
    effectiveDate: v.number(),
    notes: v.optional(v.string()),
    valuationMethod: v.optional(v.string()),
    confidenceLevel: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    return await ctx.db.insert('fmvHistory', {
      userId: args.userId,
      companyName: args.companyName,
      ticker: undefined, // Private companies don't have tickers
      fmv: args.fmv,
      currency: args.currency,
      effectiveDate: args.effectiveDate,
      dataSource: 'manual' as const,
      apiProvider: undefined,
      confidence: args.confidenceLevel || 0.9, // High confidence for manual entries
      isManualOverride: true,
      notes: args.notes || `Manual entry${args.valuationMethod ? ` using ${args.valuationMethod}` : ''}`,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Get private company valuation suggestions
export const getPrivateCompanyValuationSuggestions = query({
  args: {
    userId: v.string(),
    companyName: v.string(),
  },
  handler: async (ctx, args) => {
    // Get latest FMV record
    const latestRecord = await ctx.db
      .query('fmvHistory')
      .withIndex('by_user_and_company', (q) => 
        q.eq('userId', args.userId).eq('companyName', args.companyName)
      )
      .order('desc')
      .first();
    
    if (!latestRecord) {
      return {
        suggestions: [],
        message: 'No previous valuation data found. Consider starting with a manual entry.'
      };
    }
    
    const suggestions = [];
    const now = Date.now();
    const yearsElapsed = (now - latestRecord.effectiveDate) / (1000 * 60 * 60 * 24 * 365);
    
    // Inflation adjustment suggestion
    if (yearsElapsed > 0.5) {
      const inflatedValue = latestRecord.fmv * Math.pow(1.03, yearsElapsed);
      suggestions.push({
        method: 'Inflation Adjustment',
        suggestedValue: Math.round(inflatedValue * 100) / 100,
        confidence: Math.max(0.3, 0.8 - (yearsElapsed * 0.1)),
        description: `Adjusts last known value for ${(3 * 100)}% annual inflation over ${yearsElapsed.toFixed(1)} years`,
        recommended: yearsElapsed < 2
      });
    }
    
    // Growth estimation suggestion
    if (yearsElapsed > 0.25) {
      const growthValue = latestRecord.fmv * Math.pow(1.05, yearsElapsed);
      suggestions.push({
        method: 'Conservative Growth',
        suggestedValue: Math.round(growthValue * 100) / 100,
        confidence: Math.max(0.25, 0.6 - (yearsElapsed * 0.05)),
        description: `Assumes ${(5 * 100)}% annual growth over ${yearsElapsed.toFixed(1)} years`,
        recommended: yearsElapsed < 3
      });
    }
    
    // Industry multiple suggestion (basic implementation)
    const industryMultiplier = args.companyName.toLowerCase().includes('tech') ? 1.15 : 1.05;
    suggestions.push({
      method: 'Industry Multiple',
      suggestedValue: Math.round(latestRecord.fmv * industryMultiplier * 100) / 100,
      confidence: 0.4,
      description: `Industry-based valuation multiple (${((industryMultiplier - 1) * 100).toFixed(0)}% premium)`,
      recommended: false
    });
    
    return {
      suggestions: suggestions.sort((a, b) => (b.confidence * (b.recommended ? 1.2 : 1)) - (a.confidence * (a.recommended ? 1.2 : 1))),
      latestValue: latestRecord.fmv,
      lastUpdated: latestRecord.effectiveDate,
      dataSource: latestRecord.dataSource,
      daysSinceUpdate: (now - latestRecord.effectiveDate) / (1000 * 60 * 60 * 24)
    };
  },
});

// Bulk update private company FMVs with validation
export const bulkUpdatePrivateCompanyFMV = mutation({
  args: {
    userId: v.string(),
    updates: v.array(v.object({
      companyName: v.string(),
      fmv: v.number(),
      effectiveDate: v.number(),
      notes: v.optional(v.string()),
      valuationMethod: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results = [];
    
    for (const update of args.updates) {
      try {
        // Validate that this is actually a private company
        const existingRecords = await ctx.db
          .query('fmvHistory')
          .withIndex('by_user_and_company', (q) => 
            q.eq('userId', args.userId).eq('companyName', update.companyName)
          )
          .collect();
        
        const hasPublicRecords = existingRecords.some(record => record.ticker);
        if (hasPublicRecords) {
          results.push({
            companyName: update.companyName,
            success: false,
            error: 'Cannot manually update public company FMV'
          });
          continue;
        }
        
        const recordId = await ctx.db.insert('fmvHistory', {
          userId: args.userId,
          companyName: update.companyName,
          ticker: undefined,
          fmv: update.fmv,
          currency: 'USD',
          effectiveDate: update.effectiveDate,
          dataSource: 'manual' as const,
          apiProvider: undefined,
          confidence: 0.9,
          isManualOverride: true,
          notes: update.notes || `Bulk update${update.valuationMethod ? ` using ${update.valuationMethod}` : ''}`,
          createdAt: now,
          updatedAt: now,
        });
        
        results.push({
          companyName: update.companyName,
          success: true,
          recordId
        });
        
      } catch (error) {
        results.push({
          companyName: update.companyName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return {
      totalUpdates: args.updates.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  },
});

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