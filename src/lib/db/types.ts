import type { EncryptedData } from '@/lib/crypto/types';

// Base interface for all database records
export interface BaseRecord {
  id?: number;
  createdAt: number;
  updatedAt: number;
  userId: string;
}

// Compensation record types
export type CompensationType = 'salary' | 'bonus' | 'equity';

export interface CompensationRecord extends BaseRecord {
  type: CompensationType;
  encryptedData: EncryptedData; // All sensitive data is encrypted
  currency: string; // Currency code (not sensitive, stored in plaintext)
  syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
  lastSyncAt?: number;
  version: number; // For conflict resolution
  convexId?: string; // Convex database ID for synced records
}

// Pending sync operations
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// Sync data structures for different operations
export interface CreateCompensationSyncData {
  userId: string;
  type: CompensationType;
  encryptedData: {
    data: string;
    iv: string;
    salt: string;
  };
  currency: string;
  localId?: string; // Optional local record ID for tracking after sync
}

export interface UpdateCompensationSyncData {
  encryptedData: {
    data: string;
    iv: string;
    salt: string;
  };
  currency: string;
  version: number;
}

export interface PendingSyncItem extends BaseRecord {
  operation: SyncOperation;
  tableName: string;
  recordId: number;
  data?: Record<string, unknown>; // The data to sync
  attempts: number;
  lastAttemptAt?: number;
  status: SyncStatus;
  error?: string;
}

// User preferences and settings
export interface UserPreferences extends BaseRecord {
  theme: 'light' | 'dark' | 'system';
  currency: string;
  dateFormat: string;
  numberFormat: string;
  notifications: {
    syncUpdates: boolean;
    vestingReminders: boolean;
    bonusAlerts: boolean;
  };
  privacy: {
    enableAnalytics: boolean;
    shareUsageData: boolean;
  };
  security: {
    sessionTimeout: number; // minutes
    requirePasswordForSensitiveActions: boolean;
  };
}

// Decrypted compensation data structures (used after decryption)
export interface DecryptedSalaryData {
  company: string;
  title: string;
  location: string;
  amount: number;
  currency: string;
  startDate: string; // ISO date string
  endDate?: string; // ISO date string
  isCurrentPosition: boolean;
  notes?: string;
}

export interface DecryptedBonusData {
  company: string;
  type: 'performance' | 'signing' | 'retention' | 'spot' | 'annual' | 'other';
  amount: number;
  currency: string;
  date: string; // ISO date string
  payrollDate?: string; // ISO date string
  description: string;
  notes?: string;
}

export interface DecryptedEquityData {
  company: string;
  type: 'ISO' | 'NSO' | 'RSU' | 'ESPP' | 'other';
  shares: number;
  strikePrice?: number; // For options
  grantDate: string; // ISO date string
  vestingStart: string; // ISO date string
  vestingCliff?: number; // months
  vestingPeriod: number; // months
  vestingFrequency: 'monthly' | 'quarterly' | 'annual';
  notes?: string;
}

export type DecryptedCompensationData = 
  | DecryptedSalaryData 
  | DecryptedBonusData 
  | DecryptedEquityData;

// Database event types for change tracking
export interface DatabaseChangeEvent {
  table: string;
  operation: SyncOperation;
  recordId: number;
  timestamp: number;
  userId: string;
}

// Offline queue item for API calls
export interface OfflineQueueItem {
  id?: number;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  data?: Record<string, unknown>;
  headers?: Record<string, string>;
  timestamp: number;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'completed' | 'failed';
  error?: string;
}

// Automation-related types

// Vesting event types
export type GrantType = 'ISO' | 'NSO' | 'RSU' | 'ESPP';
export type CalculationSource = 'automated' | 'manual' | 'corrected';

export interface VestingEvent extends BaseRecord {
  equityGrantId: string;
  vestingDate: number;
  sharesVested: number;
  calculatedAt: number;
  grantType: GrantType;
  companyName: string;
  processed: boolean;
  processedAt?: number;
  fmvAtVesting?: number;
  calculationSource: CalculationSource;
}

// FMV (Fair Market Value) history
export type FMVDataSource = 'manual' | 'api' | 'estimated';

export interface FMVHistoryRecord extends BaseRecord {
  companyName: string;
  ticker?: string;
  fmv: number;
  currency: string;
  effectiveDate: number;
  dataSource: FMVDataSource;
  apiProvider?: string;
  confidence?: number;
  isManualOverride: boolean;
  notes?: string;
}

// Notification types
export type NotificationType = 
  | 'vesting_reminder_30d' 
  | 'vesting_reminder_7d' 
  | 'vesting_reminder_1d' 
  | 'vesting_occurred' 
  | 'fmv_updated' 
  | 'system_alert';

export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'cancelled';
export type DeliveryMethod = 'email' | 'in_app' | 'push';
export type RelatedEntityType = 'vesting_event' | 'equity_grant' | 'fmv_update';

export interface NotificationRecord extends BaseRecord {
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: RelatedEntityType;
  scheduledFor: number;
  deliveryMethods: DeliveryMethod[];
  status: NotificationStatus;
  attempts: number;
  lastAttemptAt?: number;
  sentAt?: number;
  emailSent: boolean;
  inAppSent: boolean;
  pushSent: boolean;
  errorMessage?: string;
  retryCount: number;
}

// User preferences with automation settings
export interface AutomationSettings {
  enableVestingCalculations: boolean;
  enableFMVUpdates: boolean;
  enableReportGeneration: boolean;
}

export interface NotificationSettings {
  vestingReminders: {
    enabled: boolean;
    days: number[];
    methods: DeliveryMethod[];
  };
  fmvUpdates: {
    enabled: boolean;
    methods: DeliveryMethod[];
  };
  systemAlerts: {
    enabled: boolean;
    methods: DeliveryMethod[];
  };
}

export interface EnhancedUserPreferences extends BaseRecord {
  notificationSettings: NotificationSettings;
  automationSettings: AutomationSettings;
}

// Vesting calculation types
export interface VestingSchedule {
  grantDate: Date;
  vestingStart: Date;
  vestingCliff?: number; // months
  vestingPeriod: number; // months
  vestingFrequency: 'monthly' | 'quarterly' | 'annual';
  totalShares: number;
}

export interface VestingCalculationResult {
  events: VestingEvent[];
  totalVested: number;
  totalUnvested: number;
  nextVestingDate?: Date;
  nextVestingShares?: number;
}

// FMV API response types
export interface FMVAPIResponse {
  symbol: string;
  price: number;
  currency: string;
  timestamp: number;
  source: string;
  confidence: number;
}

// Automation job result types
export interface AutomationJobResult {
  success: boolean;
  timestamp: number;
  message: string;
  recordsProcessed?: number;
  errors?: string[];
  metrics?: Record<string, unknown>;
}