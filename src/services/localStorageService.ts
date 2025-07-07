import { db } from '@/lib/db/database';
import type {
  CompensationRecord,
  PendingSyncItem,
  CompensationType,
  SyncOperation,
} from '@/lib/db/types';

export class LocalStorageError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'LocalStorageError';
  }
}

export class LocalStorageService {
  /**
   * Add a compensation record
   */
  static async addCompensationRecord(record: Omit<CompensationRecord, 'id'>): Promise<number> {
    try {
      const id = await db.compensationRecords.add(record as CompensationRecord);
      
      // Add to sync queue if not already synced
      if (record.syncStatus === 'pending') {
        // Get the created record to include in sync data
        const createdRecord = await db.compensationRecords.get(id);
        if (createdRecord) {
          const syncData = {
            userId: createdRecord.userId,
            type: createdRecord.type,
            encryptedData: {
              data: createdRecord.encryptedData.encryptedData,
              iv: createdRecord.encryptedData.iv,
              salt: createdRecord.encryptedData.salt,
            },
            currency: createdRecord.currency,
          };
          await this.addToSyncQueue('create', 'compensationRecords', id, syncData);
        }
      }
      
      return id;
    } catch (error) {
      throw new LocalStorageError(
        `Failed to add compensation record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_FAILED'
      );
    }
  }

  /**
   * Get compensation records by user and type
   */
  static async getCompensationRecords(
    userId: string, 
    type?: CompensationType
  ): Promise<CompensationRecord[]> {
    try {
      let query = db.compensationRecords.where('userId').equals(userId);
      
      if (type) {
        query = query.and(record => record.type === type);
      }
      
      return await query.reverse().sortBy('createdAt');
    } catch (error) {
      throw new LocalStorageError(
        `Failed to get compensation records: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'READ_FAILED'
      );
    }
  }

  /**
   * Update a compensation record
   */
  static async updateCompensationRecord(
    id: number, 
    updates: Partial<CompensationRecord>
  ): Promise<void> {
    try {
      await db.compensationRecords.update(id, {
        ...updates,
        updatedAt: Date.now(),
        version: (updates.version || 1) + 1,
        syncStatus: 'pending',
      });
      
      // Get the updated record to include in sync data
      const updatedRecord = await db.compensationRecords.get(id);
      if (updatedRecord) {
        const syncData = {
          encryptedData: {
            data: updatedRecord.encryptedData.encryptedData,
            iv: updatedRecord.encryptedData.iv,
            salt: updatedRecord.encryptedData.salt,
          },
          currency: updatedRecord.currency,
          version: updatedRecord.version,
        };
        await this.addToSyncQueue('update', 'compensationRecords', id, syncData);
      }
    } catch (error) {
      throw new LocalStorageError(
        `Failed to update compensation record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_FAILED'
      );
    }
  }

  /**
   * Delete a compensation record
   */
  static async deleteCompensationRecord(id: number): Promise<void> {
    try {
      await db.compensationRecords.delete(id);
      
      // Add to sync queue (no data needed for delete operation)
      await this.addToSyncQueue('delete', 'compensationRecords', id);
    } catch (error) {
      throw new LocalStorageError(
        `Failed to delete compensation record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_FAILED'
      );
    }
  }

  /**
   * Add an operation to the sync queue
   */
  private static async addToSyncQueue(
    operation: SyncOperation,
    tableName: string,
    recordId: number,
    data?: any
  ): Promise<void> {
    const syncItem: Omit<PendingSyncItem, 'id'> = {
      userId: 'current-user', // TODO: Get from auth context
      createdAt: Date.now(),
      updatedAt: Date.now(),
      operation,
      tableName,
      recordId,
      data,
      attempts: 0,
      status: 'pending',
    };

    await db.pendingSync.add(syncItem as PendingSyncItem);
  }

  /**
   * Get pending sync items
   */
  static async getPendingSyncItems(userId: string): Promise<PendingSyncItem[]> {
    try {
      return await db.pendingSync.where('userId').equals(userId).toArray();
    } catch (error) {
      throw new LocalStorageError(
        `Failed to get pending sync items: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SYNC_READ_FAILED'
      );
    }
  }

  /**
   * Mark sync item as completed
   */
  static async markSyncCompleted(syncItemId: number): Promise<void> {
    await db.pendingSync.update(syncItemId, {
      status: 'completed',
      updatedAt: Date.now(),
    });
  }

  /**
   * Mark sync item as failed
   */
  static async markSyncFailed(syncItemId: number, error: string): Promise<void> {
    await db.pendingSync.update(syncItemId, {
      status: 'failed',
      error,
      updatedAt: Date.now(),
    });
  }
}

// Export a singleton instance
export const localStorageService = new LocalStorageService();