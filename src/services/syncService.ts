import { db } from '@/lib/db/database';
import { LocalStorageService } from './localStorageService';
import type { PendingSyncItem, OfflineQueueItem, CreateCompensationSyncData, UpdateCompensationSyncData } from '@/lib/db/types';
import { api } from '../../convex/_generated/api';
import { ConvexReactClient } from 'convex/react';
import { Id } from '../../convex/_generated/dataModel';

export class SyncService {
  private static isOnline = true;
  private static syncInProgress = false;
  private static syncInterval: NodeJS.Timeout | null = null;
  private static listeners: Array<(status: SyncStatus) => void> = [];
  private static convexClient: ConvexReactClient | null = null;

  // Sync status interface
  static readonly syncStatus = {
    idle: 'idle' as const,
    syncing: 'syncing' as const,
    offline: 'offline' as const,
    error: 'error' as const,
  };

  /**
   * Initialize the sync service
   */
  static initialize(convexClient?: ConvexReactClient): void {
    if (convexClient) {
      this.convexClient = convexClient;
    }
    this.setupOnlineDetection();
    this.startPeriodicSync();
    
    // Clear any invalid sync items from previous sessions
    this.clearInvalidSyncItems();
    
    // Sync immediately if online
    if (this.isOnline) {
      this.triggerSync();
    }
  }

  /**
   * Set the Convex client for the sync service
   */
  static setConvexClient(client: ConvexReactClient): void {
    this.convexClient = client;
  }

  /**
   * Setup online/offline detection
   */
  private static setupOnlineDetection(): void {
    if (typeof window === 'undefined') return;

    this.isOnline = navigator.onLine;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners(this.syncStatus.idle);
      this.triggerSync();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners(this.syncStatus.offline);
    });
  }

  /**
   * Start periodic sync (every 5 minutes when online)
   */
  private static startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (this.isOnline && !this.syncInProgress) {
        this.triggerSync();
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Trigger a sync operation
   */
  static async triggerSync(): Promise<void> {
    if (!this.isOnline || this.syncInProgress) {
      return;
    }

    this.syncInProgress = true;
    this.notifyListeners(this.syncStatus.syncing);

    try {
      // Process offline queue first
      await this.processOfflineQueue();
      
      // Then process pending sync items
      await this.processPendingSync();
      
      this.notifyListeners(this.syncStatus.idle);
    } catch (error) {
      console.error('Sync failed:', error);
      this.notifyListeners(this.syncStatus.error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Process offline queue items
   */
  private static async processOfflineQueue(): Promise<void> {
    const queueItems = await db.offlineQueue
      .where('status')
      .equals('pending')
      .toArray();

    for (const item of queueItems) {
      try {
        await this.executeOfflineQueueItem(item);
        
        // Mark as completed
        await db.offlineQueue.update(item.id!, { 
          status: 'completed' 
        });
      } catch (error) {
        // Increment attempts and mark as failed if max attempts reached
        const newAttempts = item.attempts + 1;
        
        if (newAttempts >= item.maxAttempts) {
          await db.offlineQueue.update(item.id!, {
            status: 'failed',
            attempts: newAttempts,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        } else {
          await db.offlineQueue.update(item.id!, {
            attempts: newAttempts,
          });
        }
      }
    }
  }

  /**
   * Execute an offline queue item
   */
  private static async executeOfflineQueueItem(item: OfflineQueueItem): Promise<void> {
    if (!this.convexClient) {
      throw new Error('Convex client not initialized');
    }

    // Handle both old format (direct HTTP) and new format (Convex operations)
    if (item.data && item.data.operation) {
      // New format: Convex operations
      const { operation, recordId, data } = item.data;
      
      switch (operation) {
        case 'create':
          if (!data) {
            throw new Error('Missing data for create operation');
          }
          console.log('Offline queue create operation - data:', JSON.stringify(data, null, 2));
          await this.convexClient.mutation(api.compensationRecords.createCompensationRecord, data as unknown as CreateCompensationSyncData);
          break;
        
        case 'update':
          if (!data) {
            throw new Error('Missing data for update operation');
          }
          await this.convexClient.mutation(api.compensationRecords.updateCompensationRecord, {
            id: recordId as Id<"compensationRecords">,
            ...(data as unknown as UpdateCompensationSyncData),
          });
          break;
        
        case 'delete':
          await this.convexClient.mutation(api.compensationRecords.deleteCompensationRecord, {
            id: recordId as Id<"compensationRecords">,
          });
          break;
        
        default:
          throw new Error(`Unknown offline operation: ${operation}`);
      }
    } else {
      // Old format: Fall back to HTTP (for backward compatibility)
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          ...item.headers,
        },
        body: item.data ? JSON.stringify(item.data) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    }
  }

  /**
   * Process pending sync items
   */
  private static async processPendingSync(): Promise<void> {
    // TODO: Get current user ID from auth context
    const currentUserId = 'current-user'; // Placeholder
    const pendingItems = await LocalStorageService.getPendingSyncItems(currentUserId);

    for (const item of pendingItems) {
      try {
        await this.executeSyncItem(item);
        await LocalStorageService.markSyncCompleted(item.id!);
      } catch (error) {
        const newAttempts = item.attempts + 1;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (newAttempts >= 3) {
          await LocalStorageService.markSyncFailed(item.id!, errorMessage);
        } else {
          await db.pendingSync.update(item.id!, {
            attempts: newAttempts,
            lastAttemptAt: Date.now(),
          });
        }
      }
    }
  }

  /**
   * Execute a sync item
   */
  private static async executeSyncItem(item: PendingSyncItem): Promise<void> {
    if (!this.convexClient) {
      throw new Error('Convex client not initialized');
    }

    // Add to offline queue if we're offline
    if (!this.isOnline) {
      await this.addToOfflineQueue(item.operation, item.recordId.toString(), item.data);
      return;
    }

    try {
      // Execute the sync operation using Convex mutations
      switch (item.operation) {
        case 'create':
          if (!item.data) {
            throw new Error('Missing data for create operation');
          }
          console.log('Sync create operation - data:', JSON.stringify(item.data, null, 2));
          await this.convexClient.mutation(api.compensationRecords.createCompensationRecord, item.data as unknown as CreateCompensationSyncData);
          break;
        
        case 'update':
          if (!item.data) {
            throw new Error('Missing data for update operation');
          }
          await this.convexClient.mutation(api.compensationRecords.updateCompensationRecord, {
            id: item.recordId.toString() as Id<"compensationRecords">,
            ...(item.data as unknown as UpdateCompensationSyncData),
          });
          break;
        
        case 'delete':
          await this.convexClient.mutation(api.compensationRecords.deleteCompensationRecord, {
            id: item.recordId.toString() as Id<"compensationRecords">,
          });
          break;
        
        default:
          throw new Error(`Unknown sync operation: ${item.operation}`);
      }

      // Update local record sync status
      if (item.tableName === 'compensationRecords') {
        await db.compensationRecords.update(item.recordId, {
          syncStatus: 'synced',
          lastSyncAt: Date.now(),
        });
      }
    } catch (error) {
      console.error('Convex sync error:', error);
      throw error;
    }
  }

  /**
   * Add an item to the offline queue
   */
  static async addToOfflineQueue(
    operation: 'create' | 'update' | 'delete',
    recordId: string,
    data?: any
  ): Promise<void> {
    const queueItem: Omit<OfflineQueueItem, 'id'> = {
      method: 'POST', // Not used anymore, but kept for compatibility
      url: '', // Not used anymore, but kept for compatibility
      data: {
        operation,
        recordId,
        data,
      },
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: 3,
      status: 'pending',
    };

    await db.offlineQueue.add(queueItem as OfflineQueueItem);
  }

  /**
   * Get auth token (placeholder implementation)
   */
  private static getAuthToken(): string {
    // This would get the actual auth token from the auth context
    if (typeof window !== 'undefined') {
      return localStorage.getItem('authToken') || '';
    }
    return '';
  }

  /**
   * Get sync statistics
   */
  static async getSyncStats() {
    const [pendingSync, offlineQueue] = await Promise.all([
      db.pendingSync.where('status').equals('pending').count(),
      db.offlineQueue.where('status').equals('pending').count(),
    ]);

    return {
      pendingSync,
      offlineQueue,
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
    };
  }

  /**
   * Force a sync operation
   */
  static async forceSync(): Promise<void> {
    if (this.syncInProgress) {
      return;
    }

    return this.triggerSync();
  }

  /**
   * Add a sync status listener
   */
  static addSyncListener(listener: (status: SyncStatus) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of status change
   */
  private static notifyListeners(status: SyncStatus): void {
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in sync listener:', error);
      }
    });
  }

  /**
   * Clean up resources
   */
  static cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.listeners = [];
  }

  /**
   * Get current online status
   */
  static getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Get current sync status
   */
  static getCurrentStatus(): SyncStatus {
    if (!this.isOnline) return this.syncStatus.offline;
    if (this.syncInProgress) return this.syncStatus.syncing;
    return this.syncStatus.idle;
  }

  /**
   * Clear invalid sync items with empty data
   */
  static async clearInvalidSyncItems(): Promise<void> {
    try {
      // Clear invalid pending sync items
      const pendingItems = await db.pendingSync.toArray();
      const invalidItems = pendingItems.filter(item => 
        item.operation === 'create' && (!item.data || Object.keys(item.data).length === 0)
      );
      
      console.log(`Found ${invalidItems.length} invalid pending sync items, clearing...`);
      for (const item of invalidItems) {
        await db.pendingSync.delete(item.id!);
      }

      // Clear invalid offline queue items
      const queueItems = await db.offlineQueue.toArray();
      const invalidQueueItems = queueItems.filter(item => {
        if (item.data && item.data.operation === 'create') {
          const data = item.data.data;
          return !data || Object.keys(data).length === 0;
        }
        return false;
      });
      
      console.log(`Found ${invalidQueueItems.length} invalid offline queue items, clearing...`);
      for (const item of invalidQueueItems) {
        await db.offlineQueue.delete(item.id!);
      }
    } catch (error) {
      console.error('Error clearing invalid sync items:', error);
    }
  }
}

export type SyncStatus = typeof SyncService.syncStatus[keyof typeof SyncService.syncStatus];