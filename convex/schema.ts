import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  compensationRecords: defineTable({
    userId: v.string(),
    type: v.union(v.literal("salary"), v.literal("bonus"), v.literal("equity")),
    // All sensitive data is encrypted and stored in encryptedData
    encryptedData: v.object({
      data: v.string(), // base64 encoded encrypted data
      iv: v.string(), // initialization vector
      salt: v.string(), // salt for key derivation
    }),
    // Metadata (non-sensitive)
    currency: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Sync management
    syncStatus: v.union(v.literal("pending"), v.literal("synced"), v.literal("conflict"), v.literal("error")),
    lastSyncAt: v.optional(v.number()),
    version: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_type", ["userId", "type"])
    .index("by_user_and_date", ["userId", "createdAt"])
    .index("by_user_and_sync_status", ["userId", "syncStatus"]),

  vestingEvents: defineTable({
    userId: v.string(),
    equityGrantId: v.string(), // Reference to the equity grant compensation record
    vestingDate: v.number(), // Timestamp when shares vest
    sharesVested: v.number(),
    calculatedAt: v.number(), // When this event was calculated
    // Metadata for tracking
    grantType: v.union(v.literal("ISO"), v.literal("NSO"), v.literal("RSU"), v.literal("ESPP")),
    companyName: v.string(),
    // Processing status
    processed: v.boolean(),
    processedAt: v.optional(v.number()),
    // Fair market value at vesting (if available)
    fmvAtVesting: v.optional(v.number()),
    // Source of calculation
    calculationSource: v.union(v.literal("automated"), v.literal("manual"), v.literal("corrected")),
    // Audit trail
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_date", ["userId", "vestingDate"])
    .index("by_equity_grant", ["equityGrantId"])
    .index("by_vesting_date", ["vestingDate"])
    .index("by_user_and_processed", ["userId", "processed"])
    .index("by_upcoming_vests", ["userId", "vestingDate", "processed"]),

  fmvHistory: defineTable({
    userId: v.string(),
    companyName: v.string(),
    ticker: v.optional(v.string()), // Stock ticker symbol (for public companies)
    fmv: v.number(), // Fair market value per share
    currency: v.string(),
    effectiveDate: v.number(), // Date this FMV is effective
    // Data source information
    dataSource: v.union(v.literal("manual"), v.literal("api"), v.literal("estimated")),
    apiProvider: v.optional(v.string()), // e.g., "alpha_vantage", "yahoo_finance"
    // Validation and confidence
    confidence: v.optional(v.number()), // 0-1 confidence score
    isManualOverride: v.boolean(),
    // Notes and attribution
    notes: v.optional(v.string()),
    // Audit trail
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_company", ["userId", "companyName"])
    .index("by_company_and_date", ["companyName", "effectiveDate"])
    .index("by_ticker", ["ticker"])
    .index("by_effective_date", ["effectiveDate"])
    .index("by_data_source", ["dataSource"]),

  notifications: defineTable({
    userId: v.string(),
    type: v.union(
      v.literal("vesting_reminder_30d"),
      v.literal("vesting_reminder_7d"),
      v.literal("vesting_reminder_1d"),
      v.literal("vesting_occurred"),
      v.literal("fmv_updated"),
      v.literal("system_alert")
    ),
    // Notification content
    title: v.string(),
    message: v.string(),
    // Related entity information
    relatedEntityId: v.optional(v.string()), // e.g., vestingEventId, equityGrantId
    relatedEntityType: v.optional(v.union(v.literal("vesting_event"), v.literal("equity_grant"), v.literal("fmv_update"))),
    // Scheduling and delivery
    scheduledFor: v.number(), // When to send this notification
    deliveryMethods: v.array(v.union(v.literal("email"), v.literal("in_app"), v.literal("push"))),
    // Status tracking
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"), v.literal("cancelled")),
    attempts: v.number(), // Number of delivery attempts
    lastAttemptAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    // Delivery tracking
    emailSent: v.boolean(),
    inAppSent: v.boolean(),
    pushSent: v.boolean(),
    // Error handling
    errorMessage: v.optional(v.string()),
    retryCount: v.number(),
    // Audit trail
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_type", ["userId", "type"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_scheduled_for", ["scheduledFor"])
    .index("by_status", ["status"])
    .index("by_user_and_scheduled", ["userId", "scheduledFor", "status"]),

  userPreferences: defineTable({
    userId: v.string(),
    // Notification preferences
    notificationSettings: v.object({
      vestingReminders: v.object({
        enabled: v.boolean(),
        days: v.array(v.number()), // e.g., [30, 7, 1]
        methods: v.array(v.union(v.literal("email"), v.literal("in_app"), v.literal("push"))),
      }),
      fmvUpdates: v.object({
        enabled: v.boolean(),
        methods: v.array(v.union(v.literal("email"), v.literal("in_app"), v.literal("push"))),
      }),
      systemAlerts: v.object({
        enabled: v.boolean(),
        methods: v.array(v.union(v.literal("email"), v.literal("in_app"), v.literal("push"))),
      }),
    }),
    // Automation preferences
    automationSettings: v.object({
      enableVestingCalculations: v.boolean(),
      enableFMVUpdates: v.boolean(),
      enableReportGeneration: v.boolean(),
    }),
    // Audit trail
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"]),

  // FMV cache table for reducing API calls
  fmvCache: defineTable({
    ticker: v.string(),
    fmv: v.number(),
    source: v.string(),
    confidence: v.number(),
    cachedAt: v.number(),
    expiresAt: v.number(),
    hits: v.number(), // Track cache hits for analytics
  })
    .index("by_ticker", ["ticker"])
    .index("by_expires", ["expiresAt"]),

  // FMV API rate limiting table
  fmvRateLimits: defineTable({
    provider: v.string(),
    timestamp: v.number(),
    success: v.boolean(),
    responseTime: v.optional(v.number()), // Track API response times
  })
    .index("by_provider", ["provider"])
    .index("by_timestamp", ["timestamp"])
    .index("by_provider_and_time", ["provider", "timestamp"]),
});