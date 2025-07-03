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
  syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
  lastSyncAt?: number;
  version: number; // For conflict resolution
}

// Pending sync operations
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

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