import { getDb } from '@/lib/db/database';
import { LocalStorageService } from './localStorageService';
import type { PendingSyncItem, OfflineQueueItem } from '@/lib/db/types';

export class SyncService {
  private static isOnline = true;
  private static syncInProgress = false;
  private static syncInterval: NodeJS.Timeout | null = null;
  private static listeners: Array<(status: SyncStatus) => void> = [];

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
  static initialize(): void {
    this.setupOnlineDetection();
    this.startPeriodicSync();
    
    // Sync immediately if online
    if (this.isOnline) {
      this.triggerSync();
    }
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
    const db = getDb();
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
          const db = getDb();
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
    // This would normally make API calls to Convex
    // For now, we'll simulate the sync operation
    
    const baseUrl = process.env.NEXT_PUBLIC_CONVEX_URL || 'http://localhost:3000';
    let url: string;
    let method: string;
    let data: any = undefined;

    switch (item.operation) {
      case 'create':
        url = `${baseUrl}/api/compensation`;
        method = 'POST';
        data = item.data;
        break;
      
      case 'update':
        url = `${baseUrl}/api/compensation/${item.recordId}`;
        method = 'PUT';
        data = item.data;
        break;
      
      case 'delete':
        url = `${baseUrl}/api/compensation/${item.recordId}`;
        method = 'DELETE';
        break;
      
      default:
        throw new Error(`Unknown sync operation: ${item.operation}`);
    }

    // Add to offline queue if we're offline
    if (!this.isOnline) {
      await this.addToOfflineQueue(method as any, url, data);
      return;
    }

    // Execute the sync operation
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`,
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Sync failed: HTTP ${response.status}`);
    }

    // Update local record sync status
    if (item.tableName === 'compensationRecords') {
      const db = getDb();
      await db.compensationRecords.update(item.recordId, {
        syncStatus: 'synced',
        lastSyncAt: Date.now(),
      });
    }
  }

  /**
   * Add an item to the offline queue
   */
  static async addToOfflineQueue(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<void> {
    const queueItem: Omit<OfflineQueueItem, 'id'> = {
      method,
      url,
      data,
      headers,
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: 3,
      status: 'pending',
    };

    const db = getDb();
    await db.offlineQueue.add(queueItem as OfflineQueueItem);
  }

  /**
   * Get auth token (placeholder implementation)
   */
  private static getAuthToken(): string {
    // This would get the actual auth token from the auth context
    if (typeof window !== 'undefined' && 
        window.localStorage && 
        typeof window.localStorage.getItem === 'function') {
      try {
        return window.localStorage.getItem('authToken') || '';
      } catch {
        return '';
      }
    }
    return '';
  }

  /**
   * Get sync statistics
   */
  static async getSyncStats() {
    const db = getDb();
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
}

export type SyncStatus = typeof SyncService.syncStatus[keyof typeof SyncService.syncStatus];