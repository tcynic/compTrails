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
import type * as fmvUpdates from "../fmvUpdates.js";
import type * as notificationTriggers from "../notificationTriggers.js";
import type * as notifications from "../notifications.js";
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
  fmvUpdates: typeof fmvUpdates;
  notificationTriggers: typeof notificationTriggers;
  notifications: typeof notifications;
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
