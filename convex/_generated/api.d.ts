/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as compensationRecords from "../compensationRecords.js";
import type * as crons from "../crons.js";
import type * as fmvApi from "../fmvApi.js";
import type * as fmvCache from "../fmvCache.js";
import type * as fmvMonitoring from "../fmvMonitoring.js";
import type * as fmvRateLimit from "../fmvRateLimit.js";
import type * as fmvUpdates from "../fmvUpdates.js";
import type * as lib_batchProcessor from "../lib/batchProcessor.js";
import type * as lib_errorHandling from "../lib/errorHandling.js";
import type * as lib_serverDecryption from "../lib/serverDecryption.js";
import type * as lib_testVestingCalculations from "../lib/testVestingCalculations.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_vestingEngine from "../lib/vestingEngine.js";
import type * as notificationTriggers from "../notificationTriggers.js";
import type * as notifications from "../notifications.js";
import type * as types_equity from "../types/equity.js";
import type * as vestingCalculations from "../vestingCalculations.js";
import type * as vestingEvents from "../vestingEvents.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  compensationRecords: typeof compensationRecords;
  crons: typeof crons;
  fmvApi: typeof fmvApi;
  fmvCache: typeof fmvCache;
  fmvMonitoring: typeof fmvMonitoring;
  fmvRateLimit: typeof fmvRateLimit;
  fmvUpdates: typeof fmvUpdates;
  "lib/batchProcessor": typeof lib_batchProcessor;
  "lib/errorHandling": typeof lib_errorHandling;
  "lib/serverDecryption": typeof lib_serverDecryption;
  "lib/testVestingCalculations": typeof lib_testVestingCalculations;
  "lib/types": typeof lib_types;
  "lib/vestingEngine": typeof lib_vestingEngine;
  notificationTriggers: typeof notificationTriggers;
  notifications: typeof notifications;
  "types/equity": typeof types_equity;
  vestingCalculations: typeof vestingCalculations;
  vestingEvents: typeof vestingEvents;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
