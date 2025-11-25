// Database exports
export { getDb, db, CompTrailsDatabase } from './database';
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

// Service Worker
export { ServiceWorkerManager } from '@/lib/serviceWorker';
export type { ServiceWorkerStatus } from '@/lib/serviceWorker';

// Providers
export { OfflineProvider, useOffline } from '@/components/providers/OfflineProvider';