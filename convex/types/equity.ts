/**
 * Comprehensive type definitions for equity grants and vesting calculations
 */

// Core equity types
export type EquityType = 'ISO' | 'NSO' | 'RSU' | 'ESPP' | 'other';
export type VestingFrequency = 'monthly' | 'quarterly' | 'annual';
export type VestingType = 'linear' | 'cliff' | 'back-weighted' | 'performance-based' | 'custom';

// Decrypted equity grant data structure
export interface DecryptedEquityGrant {
  // Basic grant information
  company: string;
  type: EquityType;
  shares: number;
  strikePrice?: number; // Not applicable for RSUs
  
  // Date information
  grantDate: Date;
  vestingStart: Date;
  exerciseDeadline?: Date; // For stock options
  terminationDate?: Date; // If employee has left
  
  // Vesting schedule
  vestingCliff?: number; // months
  vestingPeriod: number; // months
  vestingFrequency: VestingFrequency;
  vestingType?: VestingType; // defaults to 'linear'
  
  // Special conditions
  acceleratedVesting?: AccelerationClause;
  performanceVesting?: PerformanceVestingClause;
  
  // Additional metadata
  notes?: string;
  customVestingSchedule?: CustomVestingEvent[];
}

// Acceleration clauses for M&A, IPO, etc.
export interface AccelerationClause {
  enabled: boolean;
  triggerEvents: AccelerationTrigger[];
  accelerationType: 'single' | 'double'; // single-trigger vs double-trigger
  percentageAccelerated: number; // 0-100
  conditions?: string;
}

export type AccelerationTrigger = 
  | 'acquisition' 
  | 'ipo' 
  | 'change_of_control' 
  | 'involuntary_termination' 
  | 'death' 
  | 'disability';

// Performance-based vesting
export interface PerformanceVestingClause {
  enabled: boolean;
  milestones: PerformanceMilestone[];
  vestingDelay?: number; // months after milestone achievement
}

export interface PerformanceMilestone {
  id: string;
  description: string;
  targetDate?: Date;
  percentageOfGrant: number; // 0-100
  achieved: boolean;
  achievedDate?: Date;
}

// Custom vesting schedule for non-standard arrangements
export interface CustomVestingEvent {
  date: Date;
  sharesVested: number;
  description?: string;
  conditions?: string;
}

// Vesting calculation parameters
export interface VestingCalculationParams {
  grant: DecryptedEquityGrant;
  calculationDate: Date;
  includeAcceleration?: boolean;
  includePerformance?: boolean;
  terminationDate?: Date;
  accelerationEvents?: AccelerationEvent[];
}

export interface AccelerationEvent {
  type: AccelerationTrigger;
  date: Date;
  description?: string;
}

// Generated vesting event
export interface VestingEvent {
  vestingDate: number; // timestamp
  sharesVested: number;
  cumulativeVested: number;
  grantType: EquityType;
  companyName: string;
  calculationSource: 'automated' | 'manual' | 'corrected';
  specialConditions?: VestingSpecialCondition[];
}

export interface VestingSpecialCondition {
  type: 'cliff' | 'acceleration' | 'performance' | 'termination' | 'custom';
  description: string;
  appliedShares: number;
}

// Vesting calculation result
export interface VestingCalculationResult {
  success: boolean;
  events: VestingEvent[];
  totalVested: number;
  totalRemaining: number;
  nextVestingEvent?: VestingEvent;
  error?: string;
  warnings?: string[];
  calculationMetadata: VestingCalculationMetadata;
}

export interface VestingCalculationMetadata {
  calculatedAt: number; // timestamp
  calculationMethod: VestingType;
  parametersUsed: Partial<VestingCalculationParams>;
  performanceMetrics?: {
    calculationDuration: number; // ms
    eventsGenerated: number;
    complexityScore: number; // 1-10, based on special conditions
  };
}

// Equity grant validation result
export interface EquityValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
}

// Fair Market Value context for vesting calculations
export interface FMVContext {
  companyName: string;
  fmv?: number;
  fmvDate?: Date;
  currency: string;
  dataSource?: 'manual' | 'api' | 'estimated';
  confidence?: number; // 0-1
}

// Extended vesting event with FMV data
export interface EnrichedVestingEvent extends VestingEvent {
  fmvAtVesting?: number;
  estimatedValue?: number;
  currency?: string;
  taxImplications?: TaxImplication[];
}

export interface TaxImplication {
  type: 'ordinary_income' | 'capital_gains' | 'alternative_minimum_tax';
  estimatedAmount?: number;
  description: string;
  applicableShares: number;
}

// Batch processing types
export interface VestingBatchRequest {
  grants: DecryptedEquityGrant[];
  calculationDate?: Date;
  batchId: string;
  options?: VestingBatchOptions;
}

export interface VestingBatchOptions {
  includeAcceleration?: boolean;
  includePerformance?: boolean;
  includeFMV?: boolean;
  parallelProcessing?: boolean;
  maxConcurrency?: number;
}

export interface VestingBatchResult {
  batchId: string;
  success: boolean;
  processedCount: number;
  failedCount: number;
  results: Array<{
    grantId: string;
    result: VestingCalculationResult;
  }>;
  errors: Array<{
    grantId: string;
    error: string;
  }>;
  processingTime: number; // ms
  metadata: {
    startTime: number;
    endTime: number;
    averageProcessingTime: number;
    peakMemoryUsage?: number;
  };
}

// Error types for vesting calculations
export class VestingCalculationError extends Error {
  constructor(
    message: string,
    public readonly code: VestingErrorCode,
    public readonly grantId?: string,
    public readonly context?: any
  ) {
    super(message);
    this.name = 'VestingCalculationError';
  }
}

export type VestingErrorCode = 
  | 'INVALID_GRANT_DATA'
  | 'DECRYPTION_FAILED'
  | 'CALCULATION_FAILED'
  | 'INVALID_DATES'
  | 'MISSING_PARAMETERS'
  | 'PERFORMANCE_TIMEOUT'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED';

// Configuration for vesting calculations
export interface VestingConfig {
  // Performance limits
  maxCalculationTime: number; // ms
  maxEventsPerGrant: number;
  maxBatchSize: number;
  
  // Precision settings
  sharesPrecision: number; // decimal places
  currencyPrecision: number; // decimal places
  
  // Date handling
  weekendAdjustment: 'none' | 'next_business_day' | 'previous_business_day';
  holidayAdjustment: 'none' | 'next_business_day' | 'previous_business_day';
  timezoneHandling: 'utc' | 'company_timezone' | 'user_timezone';
  
  // Special features
  enableAcceleration: boolean;
  enablePerformanceVesting: boolean;
  enableFMVIntegration: boolean;
  enableTaxCalculations: boolean;
  
  // Audit and logging
  enableAuditLogging: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

// Default configuration
export const DEFAULT_VESTING_CONFIG: VestingConfig = {
  maxCalculationTime: 30000, // 30 seconds
  maxEventsPerGrant: 1000,
  maxBatchSize: 100,
  sharesPrecision: 6,
  currencyPrecision: 2,
  weekendAdjustment: 'none',
  holidayAdjustment: 'none',
  timezoneHandling: 'utc',
  enableAcceleration: true,
  enablePerformanceVesting: true,
  enableFMVIntegration: true,
  enableTaxCalculations: false, // Disabled by default for compliance
  enableAuditLogging: true,
  logLevel: 'info',
};

// Helper type guards
export function isISO(grant: DecryptedEquityGrant): boolean {
  return grant.type === 'ISO';
}

export function isNSO(grant: DecryptedEquityGrant): boolean {
  return grant.type === 'NSO';
}

export function isRSU(grant: DecryptedEquityGrant): boolean {
  return grant.type === 'RSU';
}

export function isESPP(grant: DecryptedEquityGrant): boolean {
  return grant.type === 'ESPP';
}

export function isStockOption(grant: DecryptedEquityGrant): boolean {
  return grant.type === 'ISO' || grant.type === 'NSO';
}

export function hasStrikePrice(grant: DecryptedEquityGrant): boolean {
  return isStockOption(grant) && grant.strikePrice !== undefined;
}

export function hasAcceleration(grant: DecryptedEquityGrant): boolean {
  return grant.acceleratedVesting?.enabled === true;
}

export function hasPerformanceVesting(grant: DecryptedEquityGrant): boolean {
  return grant.performanceVesting?.enabled === true;
}

export function isCustomVesting(grant: DecryptedEquityGrant): boolean {
  return grant.vestingType === 'custom' || (grant.customVestingSchedule?.length ?? 0) > 0;
}