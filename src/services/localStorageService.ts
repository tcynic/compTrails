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
          
          await this.addToSyncQueue('create', 'compensationRecords', id, createdRecord.userId, syncData);
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
        await this.addToSyncQueue('update', 'compensationRecords', id, updatedRecord.userId, syncData);
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
      // Get the record first to obtain userId
      const record = await db.compensationRecords.get(id);
      if (!record) {
        throw new Error('Record not found');
      }
      
      await db.compensationRecords.delete(id);
      
      // Add to sync queue (no data needed for delete operation)
      await this.addToSyncQueue('delete', 'compensationRecords', id, record.userId);
    } catch (error) {
      throw new LocalStorageError(
        `Failed to delete compensation record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_FAILED'
      );
    }
  }

  /**
   * Update the end date of a previous current salary and set isCurrentPosition to false
   * Used when creating a new current salary to maintain timeline integrity
   */
  static async updatePreviousSalaryEndDate(
    recordId: number,
    endDate: string,
    password: string
  ): Promise<void> {
    try {
      // Get the existing record
      const record = await db.compensationRecords.get(recordId);
      if (!record) {
        throw new Error('Previous salary record not found');
      }

      // Decrypt the existing data
      const { EncryptionService } = await import('./encryptionService');
      const decryptionResult = await EncryptionService.decryptData(
        record.encryptedData,
        password
      );
      
      if (!decryptionResult.success) {
        throw new Error(`Failed to decrypt previous salary: ${decryptionResult.error}`);
      }

      // Parse and update the salary data
      const salaryData = JSON.parse(decryptionResult.data);
      const updatedSalaryData = {
        ...salaryData,
        endDate: endDate,
        isCurrentPosition: false, // No longer the current position
      };

      // Re-encrypt the updated data
      const encryptedData = await EncryptionService.encryptData(
        JSON.stringify(updatedSalaryData),
        password
      );

      // Update the record in the database
      const updatedRecord = {
        ...record,
        encryptedData,
        updatedAt: Date.now(),
        version: (record.version || 1) + 1,
        syncStatus: 'pending' as const,
      };

      await db.compensationRecords.put(updatedRecord);

      console.log(`[LocalStorageService] Updated previous salary ${recordId} end date to ${endDate}`);

      // Add to sync queue for cloud synchronization
      if (record.convexId) {
        const syncData = {
          userId: updatedRecord.userId,
          type: updatedRecord.type,
          encryptedData: {
            data: updatedRecord.encryptedData.encryptedData,
            iv: updatedRecord.encryptedData.iv,
            salt: updatedRecord.encryptedData.salt,
          },
          currency: updatedRecord.currency,
          version: updatedRecord.version,
        };
        await this.addToSyncQueue('update', 'compensationRecords', recordId, updatedRecord.userId, syncData);
      }
    } catch (error) {
      throw new LocalStorageError(
        `Failed to update previous salary end date: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_PREVIOUS_SALARY_FAILED'
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
    userId: string,
    data?: any
  ): Promise<void> {
    // Check for existing pending sync items for the same record and operation to prevent duplicates
    const existingItems = await db.pendingSync
      .where('status')
      .equals('pending')
      .filter(item => 
        item.operation === operation && 
        item.tableName === tableName && 
        item.recordId === recordId
      )
      .toArray();

    if (existingItems.length > 0) {
      // Update the existing item with the latest data instead of creating a duplicate
      const existingItem = existingItems[0];
      await db.pendingSync.update(existingItem.id!, {
        data: data,
        updatedAt: Date.now(),
        attempts: 0, // Reset attempts since we have new data
      });
      
      console.log(`[LocalStorageService] Updated existing sync item: ${operation} for ${tableName}:${recordId}`);
      return;
    }

    // Validate data for create operations
    if (operation === 'create' && data) {
      const isValidCreateData = data.userId && data.type && data.encryptedData && data.currency;
      if (!isValidCreateData) {
        console.error('[LocalStorageService] Invalid sync data structure:', {
          hasUserId: !!data.userId,
          hasType: !!data.type,
          hasEncryptedData: !!data.encryptedData,
          hasCurrency: !!data.currency,
          data
        });
        throw new Error('Invalid sync data structure for create operation');
      }
    }

    const syncItem: Omit<PendingSyncItem, 'id'> = {
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      operation,
      tableName,
      recordId,
      data,
      attempts: 0,
      status: 'pending',
    };

    const syncItemId = await db.pendingSync.add(syncItem as PendingSyncItem);
    console.log(`[LocalStorageService] Added new sync item: ${operation} for ${tableName}:${recordId}`);
    
    // Verify the item was stored correctly
    const storedItem = await db.pendingSync.get(syncItemId);
    if (!storedItem || !storedItem.data) {
      console.error('[LocalStorageService] Failed to store sync item data properly');
      throw new Error('Failed to store sync item data');
    }
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

  /**
   * Update a compensation record with its Convex ID after successful creation
   */
  static async updateRecordConvexId(localId: number, convexId: string): Promise<void> {
    try {
      await db.compensationRecords.update(localId, {
        convexId: convexId,
        syncStatus: 'synced',
        lastSyncAt: Date.now(),
        updatedAt: Date.now(),
      });
      console.log(`[LocalStorageService] Updated local record ${localId} with Convex ID ${convexId}`);
    } catch (error) {
      console.error(`[LocalStorageService] Failed to update record ${localId} with Convex ID:`, error);
      throw new LocalStorageError(
        `Failed to update record with Convex ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONVEX_ID_UPDATE_FAILED'
      );
    }
  }
}

// Export a singleton instance
export const localStorageService = new LocalStorageService();