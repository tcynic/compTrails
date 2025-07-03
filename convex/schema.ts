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
    amount: v.number(),
    currency: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_type", ["userId", "type"])
    .index("by_user_and_date", ["userId", "createdAt"]),
});