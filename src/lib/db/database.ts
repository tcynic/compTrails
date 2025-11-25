import Dexie, { Table } from 'dexie';
import type {
  CompensationRecord,
  PendingSyncItem,
  UserPreferences,
  OfflineQueueItem,
} from './types';

export class CompTrailsDatabase extends Dexie {
  // Tables
  compensationRecords!: Table<CompensationRecord>;
  pendingSync!: Table<PendingSyncItem>;
  userPreferences!: Table<UserPreferences>;
  offlineQueue!: Table<OfflineQueueItem>;

  constructor() {
    super('CompTrailsDB');

    this.version(1).stores({
      // Compensation records - the main data table
      compensationRecords: '++id, userId, type, syncStatus, createdAt, updatedAt, lastSyncAt',
      
      // Pending sync operations - tracks what needs to be synced
      pendingSync: '++id, userId, operation, tableName, recordId, status, createdAt, lastAttemptAt',
      
      // User preferences and settings
      userPreferences: '++id, userId, createdAt, updatedAt',
      
      // Offline queue for API calls when network is unavailable
      offlineQueue: '++id, method, url, status, timestamp, attempts',
    });

    // Add hooks for automatic timestamp management
    this.compensationRecords.hook('creating', (primKey, obj) => {
      const now = Date.now();
      obj.createdAt = now;
      obj.updatedAt = now;
      obj.version = 1;
      obj.syncStatus = 'pending';
    });

    this.compensationRecords.hook('updating', (modifications, primKey, obj) => {
      (modifications as Record<string, any>).updatedAt = Date.now();
      if (!(modifications as Record<string, any>).version) {
        (modifications as Record<string, any>).version = ((obj as Record<string, any>).version || 0) + 1;
      }
      if ((modifications as Record<string, any>).syncStatus !== 'synced') {
        (modifications as Record<string, any>).syncStatus = 'pending';
      }
    });

    this.pendingSync.hook('creating', (primKey, obj) => {
      const now = Date.now();
      obj.createdAt = now;
      obj.updatedAt = now;
      obj.attempts = 0;
      obj.status = 'pending';
    });

    this.userPreferences.hook('creating', (primKey, obj) => {
      const now = Date.now();
      obj.createdAt = now;
      obj.updatedAt = now;
    });

    this.userPreferences.hook('updating', (modifications) => {
(modifications as Record<string, any>).updatedAt = Date.now();
    });

    this.offlineQueue.hook('creating', (primKey, obj) => {
      obj.timestamp = Date.now();
      obj.attempts = 0;
      obj.status = 'pending';
      obj.maxAttempts = obj.maxAttempts || 3;
    });
  }

  // Helper method to get the current user's data
  async getCurrentUserId(): Promise<string | null> {
    // This would typically get the user ID from the auth context
    // For now, we'll use a placeholder implementation
    if (typeof window !== 'undefined' && 
        window.localStorage && 
        typeof window.localStorage.getItem === 'function') {
      try {
        const user = window.localStorage.getItem('currentUser');
        return user ? JSON.parse(user).id : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  // Helper method to filter records by current user
  async getUserCompensationRecords(userId: string) {
    return this.compensationRecords
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('createdAt');
  }

  // Helper method to get user preferences
  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    const result = await this.userPreferences
      .where('userId')
      .equals(userId)
      .first();
    return result || null;
  }

  // Helper method to get pending sync items
  async getPendingSyncItems(userId: string) {
    return this.pendingSync
      .where('userId')
      .equals(userId)
      .and(item => item.status === 'pending')
      .toArray();
  }

  // Helper method to clean up old completed sync items
  async cleanupCompletedSyncItems(olderThanDays: number = 7) {
    const cutoffDate = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    return this.pendingSync
      .where('status')
      .equals('completed')
      .and(item => item.createdAt < cutoffDate)
      .delete();
  }

  // Helper method to get database statistics
  async getStats(userId: string) {
    const [
      compensationCount,
      pendingSyncCount,
      offlineQueueCount,
    ] = await Promise.all([
      this.compensationRecords.where('userId').equals(userId).count(),
      this.pendingSync.where('userId').equals(userId).count(),
      this.offlineQueue.where('status').equals('pending').count(),
    ]);

    return {
      compensationRecords: compensationCount,
      pendingSync: pendingSyncCount,
      offlineQueue: offlineQueueCount,
    };
  }

  // Helper method to clear all user data (for logout/data reset)
  async clearUserData(userId: string) {
    await this.transaction('rw', [
      this.compensationRecords,
      this.pendingSync,
      this.userPreferences,
    ], async () => {
      await this.compensationRecords.where('userId').equals(userId).delete();
      await this.pendingSync.where('userId').equals(userId).delete();
      await this.userPreferences.where('userId').equals(userId).delete();
    });
  }

  // Helper method to export user data
  async exportUserData(userId: string) {
    const [compensationRecords, userPreferences] = await Promise.all([
      this.getUserCompensationRecords(userId),
      this.getUserPreferences(userId),
    ]);

    return {
      compensationRecords,
      userPreferences,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
  }
}

// Create and export a singleton instance (client-side only)
let _db: CompTrailsDatabase | null = null;

export const getDb = (): CompTrailsDatabase => {
  // Guard against server-side access
  if (typeof window === 'undefined') {
    throw new Error('Database can only be accessed on the client side');
  }
  
  // Guard against missing IndexedDB
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available');
  }
  
  if (!_db) {
    _db = new CompTrailsDatabase();
    
    // Enable debug mode in development
    if (process.env.NODE_ENV === 'development') {
      (window as any).db = _db;
      console.log('CompTrails database instance available as window.db');
    }
  }
  
  return _db;
};

// Export db as a Proxy for backward compatibility (client-side only)
// On server, export a dummy object that throws on access
const createDbProxy = () => {
  if (typeof window === 'undefined') {
    // Server-side: return empty object, any access will throw from getDb()
    return {} as CompTrailsDatabase;
  }
  
  // Client-side: return a Proxy that lazily initializes
  return new Proxy({} as CompTrailsDatabase, {
    get(target, prop) {
      return getDb()[prop as keyof CompTrailsDatabase];
    }
  });
};

export const db = createDbProxy();
