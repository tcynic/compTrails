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

    // FIXED: Standardize duplicate detection time window to match client-side (24 hours)
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const recentRecords = await ctx.db
      .query("compensationRecords")
      .withIndex("by_user_and_date", (q) =>
        q.eq("userId", args.userId).gte("createdAt", twentyFourHoursAgo)
      )
      .filter((q) => q.eq(q.field("type"), args.type))
      .collect();

    // Check for exact duplicates based on encrypted data content
    const existingRecord = recentRecords.find(
      (record) =>
        record.encryptedData.data === args.encryptedData.data &&
        record.encryptedData.iv === args.encryptedData.iv &&
        record.encryptedData.salt === args.encryptedData.salt &&
        record.currency === args.currency
    );

    // Also check for potential duplicates with same data but different encryption metadata
    // This catches cases where the same content was encrypted multiple times
    if (!existingRecord && recentRecords.length > 0) {
      // Check for records with identical data length (strong indicator of duplicate content)
      const sameDataLengthRecord = recentRecords.find(
        (record) =>
          record.encryptedData.data.length === args.encryptedData.data.length &&
          record.currency === args.currency &&
          // FIXED: Extend time window to 30 minutes for better duplicate catching
          // This accounts for slow sync operations and network delays
          Math.abs(record.createdAt - now) < 30 * 60 * 1000
      );

      if (sameDataLengthRecord) {
        console.log(
          `[CONVEX] Potential duplicate detected with same data length for user ${args.userId}, updating existing record ${sameDataLengthRecord._id}`
        );
        
        // Update the existing record's sync timestamp
        await ctx.db.patch(sameDataLengthRecord._id, {
          lastSyncAt: now,
          syncStatus: "synced",
        });

        return sameDataLengthRecord._id;
      }
    }

    if (existingRecord) {
      console.log(
        `[CONVEX] Exact duplicate detected for user ${args.userId}, updating lastSyncAt for record ${existingRecord._id}`
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
      // Check for existing records with the same localId from this session
      const localIdRecord = recentRecords.find(
        (record) => 
          record.localId === args.localId ||
          // FIXED: Check for records created in same sync batch (extended window)
          (Math.abs(record.createdAt - now) < 5 * 60 * 1000) // Within 5 minutes
      );

      if (localIdRecord) {
        console.log(
          `[CONVEX] Record with localId ${args.localId} already exists for user ${args.userId}, returning existing record ${localIdRecord._id}`
        );
        
        // Update the existing record's sync timestamp
        await ctx.db.patch(localIdRecord._id, {
          lastSyncAt: now,
          syncStatus: "synced",
        });

        return localIdRecord._id;
      }
    }

    return await ctx.db.insert("compensationRecords", {
      userId: args.userId,
      type: args.type,
      encryptedData: args.encryptedData,
      currency: args.currency,
      localId: args.localId,
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

    // Last-write-wins conflict resolution for local-first architecture
    // Instead of strict version checking, we log conflicts and proceed with the update
    if (existing.version !== version) {
      console.log(
        `Version conflict detected for record ${id}: local version ${version}, server version ${existing.version}. Applying last-write-wins resolution.`
      );
    }

    // Use the higher of the two versions plus 1 to maintain version progression
    const newVersion = Math.max(existing.version, version) + 1;

    return await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
      version: newVersion,
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
