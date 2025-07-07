// Database exports
export { db, CompTrailsDatabase } from './database';
export { LocalStorageService, LocalStorageError } from '@/services/localStorageService';
export { SyncService } from '@/services/syncService';

// Types
export type {
  BaseRecord,
  CompensationType,
  CompensationRecord,
  PendingSyncItem,
  UserPreferences,
  DecryptedSalaryData,
  DecryptedBonusData,
  DecryptedEquityData,
  DecryptedCompensationData,
  DatabaseChangeEvent,
  OfflineQueueItem,
  SyncOperation,
  SyncStatus,
} from './types';

// Service Worker Status Type (for compatibility)
export type ServiceWorkerStatus = 'installing' | 'waiting' | 'active' | 'error' | 'not_supported';

// Providers
export { OfflineProvider, useOffline } from '@/components/providers/OfflineProvider';