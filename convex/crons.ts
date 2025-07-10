import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily vesting calculation - runs at 9 AM UTC
crons.cron(
  "daily-vesting-calculation",
  "0 9 * * *", // 9 AM UTC every day
  internal.vestingCalculations.processVestingCalculations,
);

// Daily notification processing - runs at 8 AM UTC (before vesting calculations)
crons.cron(
  "daily-notification-processing",
  "0 8 * * *", // 8 AM UTC every day
  internal.notifications.processPendingNotifications,
);

// Daily FMV updates - runs at 10 AM UTC (after market data is available)
crons.cron(
  "daily-fmv-updates",
  "0 10 * * *", // 10 AM UTC every day
  internal.fmvUpdates.processFMVUpdates,
);

// Weekly cleanup - runs on Sundays at 6 AM UTC
crons.cron(
  "weekly-cleanup",
  "0 6 * * 0", // 6 AM UTC every Sunday
  internal.notificationTriggers.cleanupOldNotifications,
  { olderThanDays: 90 }
);

export default crons;