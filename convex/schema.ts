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
});