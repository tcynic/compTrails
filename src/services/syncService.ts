import { db } from '@/lib/db/database';
import { LocalStorageService } from './localStorageService';
import type { PendingSyncItem, OfflineQueueItem, CreateCompensationSyncData, UpdateCompensationSyncData } from '@/lib/db/types';
import { api } from '../../convex/_generated/api';
import { ConvexReactClient } from 'convex/react';
import { Id } from '../../convex/_generated/dataModel';
import { getSyncConfig, logSyncEvent } from '@/lib/config/syncConfig';

export class SyncService {
  private static isOnline = true;
  private static syncInProgress = false;
  private static syncInterval: NodeJS.Timeout | null = null;
  private static listeners: Array<(status: SyncStatus) => void> = [];
  private static convexClient: ConvexReactClient | null = null;
  private static currentUserId: string | null = null;

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
    
    // Start health check
    this.startHealthCheck();
    
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
   * Set the current user context for sync operations
   */
  static setUserContext(userId: string | null): void {
    this.currentUserId = userId;
    console.log(`[SyncService] User context set to: ${userId || 'null'}`);
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
        // Note: Periodic sync will not process pending items without user ID
        // Pending items will be processed when user performs actions
        this.triggerSync();
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Trigger a sync operation
   */
  static async triggerSync(userId?: string): Promise<void> {
    if (!this.isOnline || this.syncInProgress) {
      return;
    }

    // Use provided userId or fall back to current user context
    const effectiveUserId = userId || this.currentUserId || undefined;

    this.syncInProgress = true;
    this.notifyListeners(this.syncStatus.syncing);

    try {
      // Process offline queue first
      await this.processOfflineQueue();
      
      // Then process pending sync items with effective user ID
      await this.processPendingSync(effectiveUserId);
      
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
          const createData = data as unknown as CreateCompensationSyncData;
          const convexId = await this.convexClient.mutation(api.compensationRecords.createCompensationRecord, createData);
          
          // Store the returned Convex ID in the local record if we have a localId
          if (convexId && createData.localId) {
            const localId = parseInt(createData.localId);
            await LocalStorageService.updateRecordConvexId(localId, convexId);
            console.log(`[SyncService] Stored Convex ID ${convexId} for local record ${localId} (offline queue)`);
          }
          break;
        
        case 'update':
          if (!data) {
            throw new Error('Missing data for update operation');
          }
          console.log('Offline queue update operation - recordId:', recordId, 'data:', JSON.stringify(data, null, 2));
          
          // For update operations, we need the actual Convex ID from the local record
          const localRecord = await db.compensationRecords.get(parseInt(recordId as string));
          if (!localRecord?.convexId) {
            throw new Error(`Cannot update record ${recordId}: no Convex ID found`);
          }
          
          const updatedRecord = await this.convexClient.mutation(api.compensationRecords.updateCompensationRecord, {
            id: localRecord.convexId as Id<"compensationRecords">,
            ...(data as unknown as UpdateCompensationSyncData),
          });
          
          // Sync the updated version back to the local record
          if (updatedRecord && (updatedRecord as any).version && recordId) {
            const localId = parseInt(recordId as string);
            await db.compensationRecords.update(localId, {
              version: (updatedRecord as any).version,
              lastSyncAt: Date.now(),
              syncStatus: 'synced',
            });
            console.log(`[SyncService] Synced updated version ${(updatedRecord as any).version} back to local record ${localId} (offline queue)`);
          }
          break;
        
        case 'delete':
          // For delete operations, we need the actual Convex ID from the local record
          const localRecordToDelete = await db.compensationRecords.get(parseInt(recordId as string));
          if (!localRecordToDelete?.convexId) {
            console.warn(`[SyncService] Cannot delete record ${recordId}: no Convex ID found (likely never synced or corrupted record)`);
            // Don't throw error - just log warning and continue
            break;
          }
          
          await this.convexClient.mutation(api.compensationRecords.deleteCompensationRecord, {
            id: localRecordToDelete.convexId as Id<"compensationRecords">,
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
  private static async processPendingSync(userId?: string): Promise<void> {
    if (!userId) {
      console.log('[SyncService] No user ID available, skipping pending sync (user not authenticated)');
      return;
    }
    
    const pendingItems = await LocalStorageService.getPendingSyncItems(userId);

    console.log(`[SyncService] Processing ${pendingItems.length} pending sync items`);

    // Clean up invalid sync items first
    await this.cleanupInvalidSyncItems();

    for (const item of pendingItems) {
      // Re-fetch the item to ensure we have the latest data
      const freshItem = await db.pendingSync.get(item.id!);
      if (!freshItem) {
        console.warn(`[SyncService] Sync item ${item.id} no longer exists`);
        continue;
      }
      
      console.log(`[SyncService] Processing sync item ${freshItem.id}: ${freshItem.operation}`);
      
      try {
        await this.executeSyncItem(freshItem);
        await LocalStorageService.markSyncCompleted(freshItem.id!);
      } catch (error) {
        const newAttempts = freshItem.attempts + 1;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (newAttempts >= 3) {
          await LocalStorageService.markSyncFailed(freshItem.id!, errorMessage);
        } else {
          await db.pendingSync.update(freshItem.id!, {
            attempts: newAttempts,
            lastAttemptAt: Date.now(),
          });
        }
      }
    }
  }

  /**
   * Clean up invalid sync items
   */
  private static async cleanupInvalidSyncItems(): Promise<void> {
    try {
      const allPendingItems = await db.pendingSync.where('status').equals('pending').toArray();
      const invalidItems = allPendingItems.filter(item => {
        if (item.operation === 'create' && !item.data) {
          console.warn(`[SyncService] Found invalid sync item ${item.id} with no data`);
          return true;
        }
        return false;
      });

      for (const invalidItem of invalidItems) {
        // Check if the original record still exists and needs syncing
        const originalRecord = await db.compensationRecords.get(invalidItem.recordId);
        if (originalRecord && originalRecord.syncStatus === 'pending') {
          console.log(`[SyncService] Attempting to repair sync item ${invalidItem.id}`);
          
          // Try to recreate the sync data
          const repairData = {
            userId: originalRecord.userId,
            type: originalRecord.type,
            encryptedData: {
              data: originalRecord.encryptedData.encryptedData,
              iv: originalRecord.encryptedData.iv,
              salt: originalRecord.encryptedData.salt,
            },
            currency: originalRecord.currency,
          };
          
          await db.pendingSync.update(invalidItem.id!, { data: repairData });
          console.log(`[SyncService] Successfully repaired sync item ${invalidItem.id}`);
        } else {
          console.log(`[SyncService] Removing invalid sync item ${invalidItem.id} - original record not found or already synced`);
          await db.pendingSync.delete(invalidItem.id!);
        }
      }
    } catch (error) {
      console.error('[SyncService] Error during cleanup:', error);
    }
  }

  /**
   * Execute a sync item
   */
  private static async executeSyncItem(item: PendingSyncItem): Promise<void> {
    if (!this.convexClient) {
      throw new Error('Convex client not initialized');
    }

    console.log(`[SyncService] Executing sync: ${item.operation} for record ${item.recordId}`);

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
            console.error('[SyncService] Missing data for create operation. Attempting data recovery...');
            
            // Try to recover data from the original record
            const originalRecord = await db.compensationRecords.get(item.recordId);
            if (originalRecord && originalRecord.syncStatus === 'pending') {
              const recoveredData = {
                userId: originalRecord.userId,
                type: originalRecord.type,
                encryptedData: {
                  data: originalRecord.encryptedData.encryptedData,
                  iv: originalRecord.encryptedData.iv,
                  salt: originalRecord.encryptedData.salt,
                },
                currency: originalRecord.currency,
              };
              
              console.log(`[SyncService] Data recovery successful for record ${item.recordId}`);
              
              // Update the sync item with recovered data
              await db.pendingSync.update(item.id!, { data: recoveredData });
              item.data = recoveredData;
            } else {
              console.error('[SyncService] Data recovery failed - original record not found or already synced');
              throw new Error('Missing data for create operation and recovery failed');
            }
          }
          
          // Validate the data structure
          const createData = item.data as unknown as CreateCompensationSyncData;
          if (!createData.userId || !createData.type || !createData.encryptedData || !createData.currency) {
            console.error('[SyncService] Invalid data structure:', {
              hasUserId: !!createData.userId,
              hasType: !!createData.type,
              hasEncryptedData: !!createData.encryptedData,
              hasCurrency: !!createData.currency,
              data: createData
            });
            throw new Error('Invalid data structure for create operation');
          }
          
          console.log(`[SyncService] Syncing create operation for ${createData.type} record`);
          // Pass the local record ID for deduplication
          const syncData = {
            ...(item.data as unknown as CreateCompensationSyncData),
            localId: item.recordId.toString(),
          };
          const convexId = await this.convexClient.mutation(api.compensationRecords.createCompensationRecord, syncData);
          
          // Store the returned Convex ID in the local record
          if (convexId) {
            await LocalStorageService.updateRecordConvexId(item.recordId, convexId);
            console.log(`[SyncService] Stored Convex ID ${convexId} for local record ${item.recordId}`);
          }
          break;
        
        case 'update':
          if (!item.data) {
            throw new Error('Missing data for update operation');
          }
          
          // For update operations, we need the actual Convex ID from the local record
          const localRecord = await db.compensationRecords.get(item.recordId);
          if (!localRecord?.convexId) {
            throw new Error(`Cannot update record ${item.recordId}: no Convex ID found`);
          }
          
          console.log(`[SyncService] Updating Convex record ${localRecord.convexId} for local record ${item.recordId}`);
          const updatedRecord = await this.convexClient.mutation(api.compensationRecords.updateCompensationRecord, {
            id: localRecord.convexId as Id<"compensationRecords">,
            ...(item.data as unknown as UpdateCompensationSyncData),
          });
          
          // Sync the updated version back to the local record
          if (updatedRecord && (updatedRecord as any).version) {
            await db.compensationRecords.update(item.recordId, {
              version: (updatedRecord as any).version,
              lastSyncAt: Date.now(),
              syncStatus: 'synced',
            });
            console.log(`[SyncService] Synced updated version ${(updatedRecord as any).version} back to local record ${item.recordId}`);
          }
          break;
        
        case 'delete':
          // For delete operations, we need the actual Convex ID from the local record
          const localRecordToDelete = await db.compensationRecords.get(item.recordId);
          if (!localRecordToDelete?.convexId) {
            console.warn(`[SyncService] Cannot delete record ${item.recordId}: no Convex ID found (likely never synced or corrupted record)`);
            // Don't throw error - just log warning and continue
            break;
          }
          
          console.log(`[SyncService] Deleting Convex record ${localRecordToDelete.convexId} for local record ${item.recordId}`);
          await this.convexClient.mutation(api.compensationRecords.deleteCompensationRecord, {
            id: localRecordToDelete.convexId as Id<"compensationRecords">,
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
    data?: any,
    priority: 'normal' | 'high' | 'emergency' = 'normal'
  ): Promise<void> {
    // Check for existing pending items for the same record and operation to prevent duplicates
    const existingItems = await db.offlineQueue
      .where('status')
      .equals('pending')
      .filter(item => {
        const itemData = item.data as any;
        return itemData?.recordId === recordId && itemData?.operation === operation;
      })
      .toArray();

    if (existingItems.length > 0) {
      // If higher priority item, update the existing one
      const existingItem = existingItems[0];
      const existingData = existingItem.data as any;
      
      if (this.getPriorityValue(priority) > this.getPriorityValue(existingData?.priority || 'normal')) {
        await db.offlineQueue.update(existingItem.id!, {
          data: {
            operation,
            recordId,
            data,
            priority,
            emergencySync: priority === 'emergency',
          },
          timestamp: Date.now(),
          maxAttempts: priority === 'emergency' ? 1 : 3,
        });
        
        logSyncEvent('info', `Updated offline queue item: ${operation} for ${recordId} (priority: ${priority})`);
      } else {
        logSyncEvent('info', `Skipped duplicate offline queue item: ${operation} for ${recordId} (priority: ${priority})`);
      }
      
      // Still trigger emergency sync if this is an emergency item
      if (priority === 'emergency') {
        await this.triggerEmergencySync();
      }
      return;
    }

    const queueItem: Omit<OfflineQueueItem, 'id'> = {
      method: 'POST', // Not used anymore, but kept for compatibility
      url: '', // Not used anymore, but kept for compatibility
      data: {
        operation,
        recordId,
        data,
        priority,
        emergencySync: priority === 'emergency',
      },
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: priority === 'emergency' ? 1 : 3, // Less retries for emergency items
      status: 'pending',
    };

    await db.offlineQueue.add(queueItem as OfflineQueueItem);
    
    logSyncEvent('info', `Added to offline queue: ${operation} for ${recordId} (priority: ${priority})`);
    
    // Trigger immediate emergency sync if this is an emergency item
    if (priority === 'emergency') {
      await this.triggerEmergencySync();
    }
  }

  /**
   * Helper method to get numeric priority value for comparison
   */
  private static getPriorityValue(priority: string): number {
    switch (priority) {
      case 'emergency': return 3;
      case 'high': return 2;
      case 'normal': return 1;
      default: return 0;
    }
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
   * Start health check for sync queue
   */
  private static startHealthCheck(): void {
    if (typeof window === 'undefined') return;

    // Check sync queue health every 5 minutes
    setInterval(() => {
      this.checkSyncHealth();
    }, 5 * 60 * 1000);
  }

  /**
   * Check sync queue health and repair if needed
   */
  private static async checkSyncHealth(): Promise<void> {
    try {
      console.log('[SyncService] Running health check...');
      
      // Count pending items
      const pendingItems = await db.pendingSync.where('status').equals('pending').count();
      
      if (pendingItems > 0) {
        console.log(`[SyncService] Found ${pendingItems} pending sync items`);
        
        // Clean up invalid items
        await this.cleanupInvalidSyncItems();
        
        // Trigger sync if online
        if (this.isOnline && !this.syncInProgress) {
          console.log('[SyncService] Triggering sync from health check');
          this.triggerSync();
        }
      }
    } catch (error) {
      console.error('[SyncService] Health check failed:', error);
    }
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

      // Clean up update/delete operations that reference records without Convex IDs
      await this.cleanupInvalidUpdateDeleteOperations();
    } catch (error) {
      console.error('Error clearing invalid sync items:', error);
    }
  }

  /**
   * Clean up update/delete operations that cannot be processed due to missing Convex IDs
   */
  private static async cleanupInvalidUpdateDeleteOperations(): Promise<void> {
    try {
      // Get all pending update/delete operations
      const updateDeleteItems = await db.pendingSync
        .where('operation')
        .anyOf(['update', 'delete'])
        .and(item => item.status === 'pending')
        .toArray();

      console.log(`[SyncService] Checking ${updateDeleteItems.length} update/delete operations for validity`);

      let removedCount = 0;
      for (const item of updateDeleteItems) {
        // Check if the local record exists and has a Convex ID
        const localRecord = await db.compensationRecords.get(item.recordId);
        
        if (!localRecord) {
          // Local record doesn't exist anymore, remove sync item
          console.log(`[SyncService] Removing sync item ${item.id} - local record ${item.recordId} no longer exists`);
          await db.pendingSync.delete(item.id!);
          removedCount++;
        } else if (!localRecord.convexId && item.operation !== 'create') {
          // Record exists but has no Convex ID and it's an update/delete operation
          console.log(`[SyncService] Removing ${item.operation} sync item ${item.id} - local record ${item.recordId} has no Convex ID`);
          await db.pendingSync.delete(item.id!);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`[SyncService] Cleaned up ${removedCount} invalid update/delete sync operations`);
      }

      // Also clean up offline queue update/delete operations
      const offlineUpdateDeleteItems = await db.offlineQueue
        .where('status')
        .equals('pending')
        .filter(item => {
          const operation = item.data?.operation;
          return operation === 'update' || operation === 'delete';
        })
        .toArray();

      let offlineRemovedCount = 0;
      for (const item of offlineUpdateDeleteItems) {
        const recordId = item.data?.recordId;
        if (recordId) {
          const localRecord = await db.compensationRecords.get(parseInt(recordId as string));
          
          if (!localRecord) {
            console.log(`[SyncService] Removing offline queue item ${item.id} - local record ${recordId} no longer exists`);
            await db.offlineQueue.delete(item.id!);
            offlineRemovedCount++;
          } else if (!localRecord.convexId) {
            console.log(`[SyncService] Removing offline queue ${item.data?.operation} item ${item.id} - local record ${recordId} has no Convex ID`);
            await db.offlineQueue.delete(item.id!);
            offlineRemovedCount++;
          }
        }
      }

      if (offlineRemovedCount > 0) {
        console.log(`[SyncService] Cleaned up ${offlineRemovedCount} invalid offline queue update/delete operations`);
      }
    } catch (error) {
      console.error('[SyncService] Error cleaning up invalid update/delete operations:', error);
    }
  }

  /**
   * Emergency sync for page closure scenarios
   * Uses fast sync methods with minimal delay
   */
  static async emergencySync(): Promise<boolean> {
    const config = getSyncConfig();
    
    if (!config.emergency.enabled) {
      logSyncEvent('info', 'Emergency sync disabled');
      return false;
    }

    if (this.syncInProgress) {
      logSyncEvent('warn', 'Emergency sync skipped - sync already in progress');
      return false;
    }

    try {
      logSyncEvent('info', 'Emergency sync started');
      
      // Check if we have pending sync items
      const hasPending = await this.hasPendingSync();
      if (!hasPending) {
        logSyncEvent('info', 'No pending sync items for emergency sync');
        return true;
      }

      // If online, try immediate sync
      if (this.isOnline) {
        return await this.performEmergencySync();
      }

      // If offline, try beacon sync
      if (config.emergency.beaconFallback) {
        return await this.sendBeaconSync();
      }

      logSyncEvent('warn', 'Emergency sync failed - offline and beacon not available');
      return false;
    } catch (error) {
      logSyncEvent('error', 'Emergency sync failed', error);
      return false;
    }
  }

  /**
   * Check if there are pending sync operations
   */
  static async hasPendingSync(): Promise<boolean> {
    try {
      const [pendingSync, offlineQueue] = await Promise.all([
        db.pendingSync.where('status').equals('pending').count(),
        db.offlineQueue.where('status').equals('pending').count(),
      ]);

      return pendingSync > 0 || offlineQueue > 0;
    } catch (error) {
      logSyncEvent('error', 'Error checking pending sync', error);
      return false;
    }
  }

  /**
   * Perform emergency sync with time constraints
   */
  private static async performEmergencySync(): Promise<boolean> {
    const config = getSyncConfig();
    const timeoutMs = config.emergency.maxWaitTimeMs;
    
    this.syncInProgress = true;
    this.notifyListeners(this.syncStatus.syncing);

    try {
      // Create a promise that resolves with sync operation
      const syncPromise = this.performFastSync();
      
      // Create a timeout promise
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          logSyncEvent('warn', `Emergency sync timeout after ${timeoutMs}ms`);
          resolve(false);
        }, timeoutMs);
      });

      // Race between sync and timeout
      const result = await Promise.race([syncPromise, timeoutPromise]);
      
      this.notifyListeners(this.syncStatus.idle);
      return result;
    } catch (error) {
      logSyncEvent('error', 'Emergency sync failed', error);
      this.notifyListeners(this.syncStatus.error);
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Fast sync operation for emergency scenarios
   */
  private static async performFastSync(): Promise<boolean> {
    try {
      // Process only the most critical items first
      await this.processUrgentOfflineQueue();
      await this.processUrgentPendingSync();
      
      logSyncEvent('info', 'Emergency sync completed successfully');
      return true;
    } catch (error) {
      logSyncEvent('error', 'Fast sync failed', error);
      throw error;
    }
  }

  /**
   * Process urgent offline queue items
   */
  private static async processUrgentOfflineQueue(): Promise<void> {
    // Get only recent items (last 10 minutes) to avoid long operations
    const recentThreshold = Date.now() - 10 * 60 * 1000;
    const urgentItems = await db.offlineQueue
      .where('status')
      .equals('pending')
      .filter(item => item.timestamp > recentThreshold)
      .limit(10) // Limit to 10 items for emergency sync
      .toArray();

    for (const item of urgentItems) {
      try {
        await this.executeOfflineQueueItem(item);
        await db.offlineQueue.update(item.id!, { status: 'completed' });
      } catch (error) {
        logSyncEvent('error', 'Emergency offline queue item failed', error);
        // Continue with other items
      }
    }
  }

  /**
   * Process urgent pending sync items
   */
  private static async processUrgentPendingSync(): Promise<void> {
    // Get only recent items (last 10 minutes) to avoid long operations
    const recentThreshold = Date.now() - 10 * 60 * 1000;
    const urgentItems = await db.pendingSync
      .where('status')
      .equals('pending')
      .filter(item => item.createdAt > recentThreshold)
      .limit(10) // Limit to 10 items for emergency sync
      .toArray();

    for (const item of urgentItems) {
      try {
        await this.executeSyncItem(item);
        await LocalStorageService.markSyncCompleted(item.id!);
      } catch (error) {
        logSyncEvent('error', 'Emergency pending sync item failed', error);
        // Continue with other items
      }
    }
  }

  /**
   * Send data using Beacon API for emergency sync
   */
  static async sendBeaconSync(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      logSyncEvent('warn', 'Beacon API not supported');
      return await this.fallbackFetchSync();
    }

    try {
      // Get optimized emergency sync data
      const syncData = await this.prepareEmergencyPayload();
      
      if (!syncData || syncData.length === 0) {
        logSyncEvent('info', 'No data to beacon sync');
        return true;
      }

      // Add metadata for emergency sync tracking
      const payload = JSON.stringify({
        emergency: true,
        timestamp: Date.now(),
        items: syncData,
        totalItems: syncData.length,
      });

      const endpoint = '/api/emergency-sync';
      const success = navigator.sendBeacon(endpoint, payload);

      if (success) {
        logSyncEvent('info', `Beacon sync successful - ${syncData.length} items`);
        // Mark items as attempted (they will be processed by the server)
        await this.markBeaconSyncAttempted(syncData);
        
        // Track emergency sync analytics
        if (typeof window !== 'undefined') {
          const { AnalyticsService } = await import('./analyticsService');
          AnalyticsService.trackEmergencySync({
            sync_type: 'emergency',
            method: 'beacon',
            success: true,
            pending_items: syncData.length,
            trigger_type: 'auto',
          });
        }
      } else {
        logSyncEvent('warn', 'Beacon sync failed, trying fallback');
        return await this.fallbackFetchSync();
      }

      return success;
    } catch (error) {
      logSyncEvent('error', 'Beacon sync error', error);
      
      // Track failed emergency sync
      if (typeof window !== 'undefined') {
        try {
          const { AnalyticsService } = await import('./analyticsService');
          AnalyticsService.trackEmergencySync({
            sync_type: 'emergency',
            method: 'beacon',
            success: false,
            error_type: error instanceof Error ? error.name : 'unknown',
            trigger_type: 'auto',
          });
        } catch {
          // Ignore analytics errors during emergency sync
        }
      }
      
      return await this.fallbackFetchSync();
    }
  }

  /**
   * Fallback to fetch with keepalive for emergency sync
   */
  private static async fallbackFetchSync(): Promise<boolean> {
    try {
      const syncData = await this.prepareSyncPayload();
      
      if (!syncData || syncData.length === 0) {
        return true;
      }

      const payload = JSON.stringify(syncData);
      const endpoint = '/api/emergency-sync';

      const response = await fetch(endpoint, {
        method: 'POST',
        body: payload,
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`,
        },
      });

      if (response.ok) {
        logSyncEvent('info', 'Fallback fetch sync successful');
        await this.markBeaconSyncAttempted(syncData);
        return true;
      } else {
        logSyncEvent('error', `Fallback fetch sync failed: ${response.status}`);
        return false;
      }
    } catch (error) {
      logSyncEvent('error', 'Fallback fetch sync error', error);
      return false;
    }
  }

  /**
   * Prepare sync payload for beacon/fetch transmission
   */
  private static async prepareSyncPayload(): Promise<any[]> {
    const [pendingItems, offlineItems] = await Promise.all([
      db.pendingSync.where('status').equals('pending').limit(10).toArray(),
      db.offlineQueue.where('status').equals('pending').limit(10).toArray(),
    ]);

    const syncData = [];

    // Add pending sync items
    for (const item of pendingItems) {
      syncData.push({
        id: item.id,
        type: 'pending_sync',
        operation: item.operation,
        recordId: item.recordId,
        data: item.data,
        tableName: item.tableName,
      });
    }

    // Add offline queue items
    for (const item of offlineItems) {
      syncData.push({
        id: item.id,
        type: 'offline_queue',
        operation: item.data?.operation,
        recordId: item.data?.recordId,
        data: item.data?.data,
      });
    }

    return syncData;
  }

  /**
   * Prepare optimized emergency sync payload for beacon transmission
   * Prioritizes recent and critical data with size limits
   */
  private static async prepareEmergencyPayload(): Promise<any[]> {
    const recentThreshold = Date.now() - 10 * 60 * 1000; // Last 10 minutes only
    const maxItems = 5; // Limit for emergency sync
    
    // Get emergency items first, then other recent items
    const [emergencyOffline, urgentPending, urgentOffline] = await Promise.all([
      // Priority 1: Emergency items
      db.offlineQueue
        .where('status').equals('pending')
        .filter(item => item.data?.emergencySync === true)
        .toArray(),
      // Priority 2: Recent pending sync items
      db.pendingSync
        .where('status').equals('pending')
        .filter(item => item.createdAt > recentThreshold)
        .limit(maxItems)
        .toArray(),
      // Priority 3: Recent offline queue items
      db.offlineQueue
        .where('status').equals('pending')
        .filter(item => item.timestamp > recentThreshold && !item.data?.emergencySync)
        .limit(maxItems)
        .toArray(),
    ]);

    const syncData: any[] = [];

    // Enhanced priority function with emergency support
    const prioritizeItem = (item: any) => {
      // Emergency items get top priority
      if (item.data?.emergencySync || item.data?.priority === 'emergency') {
        return 0; // Highest priority
      }
      
      const operation = item.operation || item.data?.operation;
      const priority = item.data?.priority;
      
      if (priority === 'high' || operation === 'create' || operation === 'update' || operation === 'delete') {
        return 1; // High priority
      }
      
      if (priority === 'normal') {
        return 2; // Normal priority
      }
      
      return 3; // Lower priority
    };

    // Add emergency items first (always included)
    emergencyOffline.forEach(item => {
      syncData.push({
        id: item.id,
        type: 'offline_queue',
        op: item.data?.operation,
        rid: item.data?.recordId,
        data: this.compressPayloadData(item.data?.data),
        ts: item.timestamp,
        emergency: true,
        priority: item.data?.priority || 'emergency',
      });
    });

    // Add high-priority pending sync items with minimal payload
    urgentPending
      .sort((a, b) => prioritizeItem(a) - prioritizeItem(b))
      .slice(0, maxItems - syncData.length) // Reserve space for emergency items
      .forEach(item => {
        syncData.push({
          id: item.id,
          type: 'pending_sync',
          op: item.operation, // Shortened field names
          rid: item.recordId,
          data: this.compressPayloadData(item.data), // Compress data
          tbl: item.tableName,
          ts: item.createdAt,
          priority: 'normal',
        });
      });

    // Add remaining offline queue items if space allows
    const remainingSpace = maxItems - syncData.length;
    if (remainingSpace > 0) {
      urgentOffline
        .sort((a, b) => prioritizeItem(a) - prioritizeItem(b))
        .slice(0, remainingSpace)
        .forEach(item => {
          syncData.push({
            id: item.id,
            type: 'offline_queue',
            op: item.data?.operation,
            rid: item.data?.recordId,
            data: this.compressPayloadData(item.data?.data),
            ts: item.timestamp,
            priority: item.data?.priority || 'normal',
          });
        });
    }

    // Limit total payload size for beacon (typically 64KB limit)
    const totalSize = JSON.stringify(syncData).length;
    if (totalSize > 32000) { // 32KB safety limit
      logSyncEvent('warn', `Emergency payload size ${totalSize} exceeds limit, truncating`);
      // Keep emergency items but trim others
      const emergencyItems = syncData.filter(item => item.emergency);
      const otherItems = syncData.filter(item => !item.emergency);
      const trimmedOthers = otherItems.slice(0, Math.floor(otherItems.length / 2));
      return [...emergencyItems, ...trimmedOthers];
    }

    return syncData;
  }

  /**
   * Compress payload data by removing non-essential fields
   */
  private static compressPayloadData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Remove computed and non-essential fields to reduce payload size
    const compressed = { ...data };
    
    // Remove metadata that can be regenerated
    delete compressed.createdAt;
    delete compressed.modifiedAt;
    delete compressed.version;
    delete compressed.syncStatus;
    
    // Remove UI-only fields
    delete compressed.isExpanded;
    delete compressed.isSelected;
    delete compressed.displayOrder;
    
    return compressed;
  }

  /**
   * Mark beacon sync items as attempted
   */
  private static async markBeaconSyncAttempted(syncData: any[]): Promise<void> {
    for (const item of syncData) {
      try {
        if (item.type === 'pending_sync') {
          await db.pendingSync.update(item.id, {
            attempts: (await db.pendingSync.get(item.id))?.attempts || 0 + 1,
            lastAttemptAt: Date.now(),
          });
        } else if (item.type === 'offline_queue') {
          await db.offlineQueue.update(item.id, {
            attempts: (await db.offlineQueue.get(item.id))?.attempts || 0 + 1,
          });
        }
      } catch (error) {
        logSyncEvent('error', 'Error marking beacon sync attempted', error);
      }
    }
  }

  /**
   * Trigger emergency sync (public method for PageLifecycleService)
   */
  static triggerEmergencySync(): void {
    // Use setTimeout to avoid blocking the calling thread
    setTimeout(() => {
      this.emergencySync().catch(error => {
        logSyncEvent('error', 'Emergency sync trigger failed', error);
      });
    }, 0);
  }

  /**
   * Register background sync for specific operation
   */
  static async registerBackgroundSync(operation: string, recordId: string): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('sync' in window.ServiceWorkerRegistration.prototype)) {
      logSyncEvent('warn', 'Background Sync API not supported');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const tag = `compensation-sync-${operation}-${recordId}`;
      
      // Cast to include sync property (Background Sync API)
      await (registration as any).sync.register(tag);
      
      // Send message to service worker with operation details
      if (registration.active) {
        registration.active.postMessage({
          type: 'REGISTER_BACKGROUND_SYNC',
          tag,
          operation,
          recordId,
        });
      }
      
      logSyncEvent('info', 'Background sync registered', { tag, operation, recordId });
      return true;
      
    } catch (error) {
      logSyncEvent('error', 'Background sync registration failed', error);
      return false;
    }
  }

  /**
   * Check if Background Sync API is supported
   */
  static isBackgroundSyncSupported(): boolean {
    return (
      'serviceWorker' in navigator &&
      'sync' in window.ServiceWorkerRegistration.prototype
    );
  }

  /**
   * Get background sync status
   */
  static async getBackgroundSyncStatus(): Promise<{
    supported: boolean;
    registered: string[];
    queueSize: number;
  }> {
    const supported = this.isBackgroundSyncSupported();
    
    if (!supported) {
      return { supported: false, registered: [], queueSize: 0 };
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const tags = await (registration as any).sync.getTags();
      
      // Get queue size from pending sync items
      const queueSize = await this.getBackgroundSyncQueueSize();
      
      return {
        supported: true,
        registered: tags.filter((tag: string) => tag.startsWith('compensation-sync')),
        queueSize,
      };
      
    } catch (error) {
      logSyncEvent('error', 'Error getting background sync status', error);
      return { supported: true, registered: [], queueSize: 0 };
    }
  }

  /**
   * Test emergency sync functionality (for development/debugging)
   */
  static async testEmergencySync(): Promise<{
    beaconSupported: boolean;
    fetchKeepaliveSupported: boolean;
    serviceWorkerSupported: boolean;
    emergencySyncSuccess: boolean;
    payloadSize: number;
    duration: number;
  }> {
    const startTime = Date.now();
    const testResults = {
      beaconSupported: typeof navigator !== 'undefined' && 'sendBeacon' in navigator,
      fetchKeepaliveSupported: typeof fetch !== 'undefined',
      serviceWorkerSupported: 'serviceWorker' in navigator,
      emergencySyncSuccess: false,
      payloadSize: 0,
      duration: 0,
    };

    try {
      // Create test data for emergency sync
      await this.addToOfflineQueue('create', 'test-emergency-sync', { test: true }, 'emergency');
      
      // Test emergency payload preparation
      const payload = await this.prepareEmergencyPayload();
      testResults.payloadSize = JSON.stringify(payload).length;
      
      // Test beacon sync (if supported)
      if (testResults.beaconSupported) {
        testResults.emergencySyncSuccess = await this.sendBeaconSync();
      } else if (testResults.fetchKeepaliveSupported) {
        testResults.emergencySyncSuccess = await this.fallbackFetchSync();
      }
      
      // Clean up test data
      await db.offlineQueue.filter(item => !!(item.data && (item.data as any).test === true)).delete();
      
      logSyncEvent('info', 'Emergency sync test completed', testResults);
    } catch (error) {
      logSyncEvent('error', 'Emergency sync test failed', error);
    }

    testResults.duration = Date.now() - startTime;
    return testResults;
  }

  /**
   * Validate emergency sync configuration and browser capabilities
   */
  static validateEmergencySyncCapabilities(): {
    supported: boolean;
    features: {
      beaconApi: boolean;
      fetchKeepalive: boolean;
      serviceWorker: boolean;
      visibilityApi: boolean;
      pageLifecycleApi: boolean;
    };
    recommendations: string[];
  } {
    const features = {
      beaconApi: typeof navigator !== 'undefined' && 'sendBeacon' in navigator,
      fetchKeepalive: typeof fetch !== 'undefined',
      serviceWorker: 'serviceWorker' in navigator,
      visibilityApi: typeof document !== 'undefined' && 'visibilityState' in document,
      pageLifecycleApi: typeof window !== 'undefined' && 'addEventListener' in window,
    };

    const recommendations: string[] = [];
    let supported = false;

    // Check if at least one sync method is available
    if (features.beaconApi || features.fetchKeepalive) {
      supported = true;
    } else {
      recommendations.push('Emergency sync requires Beacon API or Fetch API support');
    }

    // Check for page lifecycle support
    if (!features.visibilityApi) {
      recommendations.push('Page Visibility API not supported - visibility change sync disabled');
    }

    if (!features.pageLifecycleApi) {
      recommendations.push('Page lifecycle events not supported - beforeunload sync disabled');
    }

    if (!features.serviceWorker) {
      recommendations.push('Service Worker not supported - background sync disabled');
    }

    // Browser-specific recommendations
    if (typeof navigator !== 'undefined') {
      const userAgent = navigator.userAgent;
      if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        recommendations.push('Safari has limited Background Sync support - relying on beacon/fetch');
      }
      if (userAgent.includes('Firefox')) {
        recommendations.push('Firefox has experimental Background Sync support');
      }
    }

    return {
      supported,
      features,
      recommendations,
    };
  }

  /**
   * Get emergency sync health metrics
   */
  static async getEmergencySyncHealth(): Promise<{
    queueSize: number;
    emergencyItems: number;
    oldestItemAge: number;
    recentFailures: number;
    avgSyncDuration: number;
  }> {
    try {
      const [queueItems, emergencyItems] = await Promise.all([
        db.offlineQueue.where('status').equals('pending').toArray(),
        db.offlineQueue.filter(item => !!(item.data && (item.data as any).emergencySync === true)).toArray(),
      ]);

      const now = Date.now();
      const oldestItem = queueItems.sort((a, b) => a.timestamp - b.timestamp)[0];
      const oldestItemAge = oldestItem ? now - oldestItem.timestamp : 0;

      // Get recent failures (last 24 hours)
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const recentFailures = queueItems.filter(item => 
        item.timestamp > dayAgo && item.attempts > 0
      ).length;

      return {
        queueSize: queueItems.length,
        emergencyItems: emergencyItems.length,
        oldestItemAge,
        recentFailures,
        avgSyncDuration: 0, // Would need to track this in actual sync operations
      };
    } catch (error) {
      logSyncEvent('error', 'Error getting emergency sync health', error);
      return {
        queueSize: 0,
        emergencyItems: 0,
        oldestItemAge: 0,
        recentFailures: 0,
        avgSyncDuration: 0,
      };
    }
  }

  /**
   * Get the size of the background sync queue
   */
  private static async getBackgroundSyncQueueSize(): Promise<number> {
    try {
      const [pendingSync, offlineQueue] = await Promise.all([
        db.pendingSync.where('status').equals('pending').count(),
        db.offlineQueue.where('status').equals('pending').count(),
      ]);

      return pendingSync + offlineQueue;
    } catch (error) {
      logSyncEvent('error', 'Error getting background sync queue size', error);
      return 0;
    }
  }

  /**
   * Setup service worker message listener for background sync events
   */
  static setupBackgroundSyncListener(): () => void {
    if (!('serviceWorker' in navigator)) {
      return () => {};
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'sw-background-sync') {
        const { payload } = event.data;
        
        logSyncEvent('info', 'Background sync event received', payload);
        
        // Handle different sync events
        switch (payload.event) {
          case 'emergency-sync-success':
            this.notifyListeners(this.syncStatus.idle);
            break;
            
          case 'emergency-sync-failed':
            this.notifyListeners(this.syncStatus.error);
            break;
            
          case 'sync-success':
            this.notifyListeners(this.syncStatus.idle);
            // Trigger a regular sync to clean up any remaining items
            this.triggerSync();
            break;
            
          case 'sync-failed':
            logSyncEvent('warn', 'Background sync failed', payload);
            break;
            
          case 'background-sync-registered':
            logSyncEvent('info', 'Background sync registered by service worker', payload);
            break;
            
          case 'background-sync-registration-failed':
            logSyncEvent('error', 'Background sync registration failed in service worker', payload);
            break;
            
          default:
            logSyncEvent('debug', 'Unknown background sync event', payload);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);
    
    // Return cleanup function
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }

  /**
   * Enhanced add to offline queue with background sync support
   */
  static async addToOfflineQueueWithBackgroundSync(
    operation: 'create' | 'update' | 'delete',
    recordId: string,
    data?: any
  ): Promise<void> {
    // Add to offline queue as before
    await this.addToOfflineQueue(operation, recordId, data);
    
    // Register background sync for this operation
    await this.registerBackgroundSync(operation, recordId);
  }

  /**
   * Pull data from Convex and sync to local IndexedDB (bidirectional sync)
   * This is the missing piece that allows data to flow FROM Convex TO local storage
   */
  static async pullFromConvex(userId: string, _password: string): Promise<{
    success: boolean;
    recordsAdded: number;
    recordsUpdated: number;
    errors: string[];
  }> {
    if (!this.convexClient) {
      throw new Error('Convex client not initialized');
    }

    if (!this.isOnline) {
      console.log('[SyncService] Cannot pull from Convex - offline');
      return { success: false, recordsAdded: 0, recordsUpdated: 0, errors: ['Offline'] };
    }

    const result = {
      success: true,
      recordsAdded: 0,
      recordsUpdated: 0,
      errors: [] as string[]
    };

    try {
      console.log(`[SyncService] Starting pull from Convex for user ${userId}`);
      
      // Get all records from Convex for this user
      const convexRecords = await this.convexClient.query(api.compensationRecords.getCompensationRecords, {
        userId
      });

      console.log(`[SyncService] Found ${convexRecords.length} records in Convex`);

      // Get all local records for comparison
      const localRecords = await LocalStorageService.getCompensationRecords(userId);
      console.log(`[SyncService] Found ${localRecords.length} records in local storage`);

      // Create maps for efficient comparison
      const localByConvexId = new Map();
      const localByLocalId = new Map();
      
      for (const local of localRecords) {
        if (local.convexId) {
          localByConvexId.set(local.convexId, local);
        }
        if (local.id) {
          localByLocalId.set(local.id, local);
        }
      }

      // Process each Convex record
      for (const convexRecord of convexRecords) {
        try {
          const existingLocal = localByConvexId.get(convexRecord._id);
          
          if (!existingLocal) {
            // This is a new record from Convex that doesn't exist locally
            // Add it to local storage
            console.log(`[SyncService] Adding new record from Convex: ${convexRecord._id}`);
            
            const newLocalRecord = {
              userId: convexRecord.userId,
              type: convexRecord.type,
              encryptedData: {
                encryptedData: convexRecord.encryptedData.data,
                iv: convexRecord.encryptedData.iv,
                salt: convexRecord.encryptedData.salt,
                algorithm: 'AES-GCM' as const,
                keyDerivation: 'Argon2id' as const,
              },
              currency: convexRecord.currency,
              createdAt: convexRecord.createdAt,
              updatedAt: convexRecord.updatedAt || convexRecord.createdAt,
              version: convexRecord.version || 1,
              syncStatus: 'synced' as const,
              lastSyncAt: Date.now(),
              convexId: convexRecord._id,
              localId: convexRecord.localId || undefined,
            };

            const localId = await LocalStorageService.addCompensationRecord(newLocalRecord);
            console.log(`[SyncService] Added record ${convexRecord._id} as local ID ${localId}`);
            result.recordsAdded++;
            
          } else {
            // Record exists locally, check if Convex version is newer
            const convexVersion = convexRecord.version || 1;
            const localVersion = existingLocal.version || 1;
            const convexUpdatedAt = convexRecord.updatedAt || convexRecord.createdAt;
            const localUpdatedAt = existingLocal.updatedAt || existingLocal.createdAt;
            
            if (convexVersion > localVersion || convexUpdatedAt > localUpdatedAt) {
              console.log(`[SyncService] Updating local record ${existingLocal.id} with newer Convex data`);
              
              const updates = {
                encryptedData: {
                  encryptedData: convexRecord.encryptedData.data,
                  iv: convexRecord.encryptedData.iv,
                  salt: convexRecord.encryptedData.salt,
                  algorithm: 'AES-GCM' as const,
                  keyDerivation: 'Argon2id' as const,
                },
                currency: convexRecord.currency,
                updatedAt: convexUpdatedAt,
                version: convexVersion,
                syncStatus: 'synced' as const,
                lastSyncAt: Date.now(),
              };
              
              await LocalStorageService.updateCompensationRecord(existingLocal.id!, updates);
              console.log(`[SyncService] Updated local record ${existingLocal.id}`);
              result.recordsUpdated++;
            }
          }
        } catch (recordError) {
          const errorMsg = `Failed to process record ${convexRecord._id}: ${recordError instanceof Error ? recordError.message : 'Unknown error'}`;
          console.error(`[SyncService] ${errorMsg}`);
          result.errors.push(errorMsg);
          result.success = false;
        }
      }

      console.log(`[SyncService] Pull from Convex completed: ${result.recordsAdded} added, ${result.recordsUpdated} updated, ${result.errors.length} errors`);
      
      return result;
    } catch (error) {
      const errorMsg = `Pull from Convex failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[SyncService] ${errorMsg}`);
      result.errors.push(errorMsg);
      result.success = false;
      return result;
    }
  }

  /**
   * Enhanced bidirectional sync that pulls from Convex first, then pushes pending changes
   */
  static async triggerBidirectionalSync(userId: string, password: string): Promise<void> {
    if (!this.isOnline || this.syncInProgress) {
      return;
    }

    this.syncInProgress = true;
    this.notifyListeners(this.syncStatus.syncing);

    try {
      console.log('[SyncService] Starting bidirectional sync');
      
      // First: Pull latest data from Convex
      const pullResult = await this.pullFromConvex(userId, password);
      console.log(`[SyncService] Pull phase completed: ${pullResult.recordsAdded} added, ${pullResult.recordsUpdated} updated`);
      
      // Then: Push any pending local changes
      await this.processPendingSync(userId);
      console.log('[SyncService] Push phase completed');
      
      this.notifyListeners(this.syncStatus.idle);
    } catch (error) {
      console.error('[SyncService] Bidirectional sync failed:', error);
      this.notifyListeners(this.syncStatus.error);
    } finally {
      this.syncInProgress = false;
    }
  }
}

export type SyncStatus = typeof SyncService.syncStatus[keyof typeof SyncService.syncStatus];