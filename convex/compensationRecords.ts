import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createCompensationRecord = mutation({
  args: {
    userId: v.string(),
    type: v.union(v.literal("salary"), v.literal("bonus"), v.literal("equity")),
    encryptedData: v.object({
      data: v.string(),
      iv: v.string(),
      salt: v.string(),
    }),
    currency: v.string(),
    localId: v.optional(v.string()), // Optional client-side identifier for deduplication
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for potential duplicates within the last 10 minutes to prevent rapid duplicate creation
    const tenMinutesAgo = now - 10 * 60 * 1000;
    const recentRecords = await ctx.db
      .query("compensationRecords")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", args.userId).gte("createdAt", tenMinutesAgo)
      )
      .filter((q) => q.eq(q.field("type"), args.type))
      .collect();

    // Check for exact duplicates based on encrypted data
    const existingRecord = recentRecords.find(
      (record) =>
        record.encryptedData.data === args.encryptedData.data &&
        record.encryptedData.iv === args.encryptedData.iv &&
        record.encryptedData.salt === args.encryptedData.salt &&
        record.currency === args.currency
    );

    if (existingRecord) {
      console.log(
        `Duplicate record detected for user ${args.userId}, updating lastSyncAt for record ${existingRecord._id}`
      );

      // Update the lastSyncAt timestamp for the duplicate record
      await ctx.db.patch(existingRecord._id, {
        lastSyncAt: now,
        syncStatus: "synced", // Ensure sync status is updated
      });

      return existingRecord._id;
    }

    // If localId is provided, check for records with the same localId (client-side deduplication)
    if (args.localId) {
      // Note: We don't store localId in the database, but we can use it for deduplication during sync
      // In a production system, you might want to add a localId field to track client-side IDs
    }

    const { localId, ...recordData } = args;
    return await ctx.db.insert("compensationRecords", {
      ...recordData,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      version: 1,
    });
  },
});

export const updateCompensationRecord = mutation({
  args: {
    id: v.id("compensationRecords"),
    encryptedData: v.object({
      data: v.string(),
      iv: v.string(),
      salt: v.string(),
    }),
    currency: v.string(),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, version, ...updates } = args;

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Record not found");
    }

    // Simple conflict resolution: check version
    if (existing.version !== version) {
      throw new Error("Version conflict - record has been modified");
    }

    return await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
      version: version + 1,
      syncStatus: "synced",
    });
  },
});

export const deleteCompensationRecord = mutation({
  args: {
    id: v.id("compensationRecords"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.delete(args.id);
  },
});

export const getCompensationRecords = query({
  args: {
    userId: v.string(),
    type: v.optional(
      v.union(v.literal("salary"), v.literal("bonus"), v.literal("equity"))
    ),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("compensationRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId));

    if (args.type) {
      query = query.filter((q) => q.eq(q.field("type"), args.type));
    }

    return await query.order("desc").collect();
  },
});

export const getPendingSyncRecords = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("compensationRecords")
      .withIndex("by_user_and_sync_status", (q) =>
        q.eq("userId", args.userId).eq("syncStatus", "pending")
      )
      .collect();
  },
});
