import { db } from '@/lib/db/database';
import { EncryptionService } from './encryptionService';
import type {
  CompensationRecord,
  PendingSyncItem,
  UserPreferences,
  DecryptedCompensationData,
  DecryptedSalaryData,
  DecryptedBonusData,
  DecryptedEquityData,
  CompensationType,
  SyncOperation,
} from '@/lib/db/types';
import type { EncryptedData } from '@/lib/crypto/types';

export class LocalStorageError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'LocalStorageError';
  }
}

export class LocalStorageService {
  private static currentUserId: string | null = null;
  private static userPassword: string | null = null;

  /**
   * Initialize the service with user credentials
   */
  static async initialize(userId: string, password: string): Promise<void> {
    this.currentUserId = userId;
    this.userPassword = password;
    
    // Ensure user preferences exist
    await this.ensureUserPreferences();
  }

  /**
   * Clear user session data
   */
  static clearSession(): void {
    this.currentUserId = null;
    this.userPassword = null;
  }

  /**
   * Ensure user preferences exist with defaults
   */
  private static async ensureUserPreferences(): Promise<void> {
    if (!this.currentUserId) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    const existing = await db.getUserPreferences(this.currentUserId);
    if (!existing) {
      const defaultPreferences: Omit<UserPreferences, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: this.currentUserId,
        theme: 'system',
        currency: 'USD',
        dateFormat: 'MM/dd/yyyy',
        numberFormat: 'US',
        notifications: {
          syncUpdates: true,
          vestingReminders: true,
          bonusAlerts: true,
        },
        privacy: {
          enableAnalytics: false,
          shareUsageData: false,
        },
        security: {
          sessionTimeout: 15,
          requirePasswordForSensitiveActions: true,
        },
      };

      await db.userPreferences.add(defaultPreferences as UserPreferences);
    }
  }

  /**
   * Create a new compensation record
   */
  static async createCompensationRecord(
    type: CompensationType,
    data: DecryptedCompensationData
  ): Promise<number> {
    if (!this.currentUserId || !this.userPassword) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    try {
      // Encrypt the sensitive data
      const encryptedData = await EncryptionService.encryptData(
        JSON.stringify(data),
        this.userPassword
      );

      const record: Omit<CompensationRecord, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: this.currentUserId,
        type,
        encryptedData,
        syncStatus: 'pending',
        version: 1,
      };

      const id = await db.compensationRecords.add(record as CompensationRecord);
      
      // Add to sync queue
      await this.addToSyncQueue('create', 'compensationRecords', id);
      
      return id;
    } catch (error) {
      throw new LocalStorageError(
        `Failed to create compensation record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_FAILED'
      );
    }
  }

  /**
   * Get a compensation record by ID (decrypted)
   */
  static async getCompensationRecord(id: number): Promise<{
    record: CompensationRecord;
    decryptedData: DecryptedCompensationData;
  } | null> {
    if (!this.currentUserId || !this.userPassword) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    try {
      const record = await db.compensationRecords.get(id);
      if (!record || record.userId !== this.currentUserId) {
        return null;
      }

      const decryptResult = await EncryptionService.decryptData(
        record.encryptedData,
        this.userPassword
      );

      if (!decryptResult.success) {
        throw new LocalStorageError(
          `Failed to decrypt record: ${decryptResult.error}`,
          'DECRYPT_FAILED'
        );
      }

      const decryptedData = JSON.parse(decryptResult.data) as DecryptedCompensationData;
      
      return { record, decryptedData };
    } catch (error) {
      throw new LocalStorageError(
        `Failed to get compensation record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_FAILED'
      );
    }
  }

  /**
   * Get all compensation records for the current user
   */
  static async getAllCompensationRecords(): Promise<Array<{
    record: CompensationRecord;
    decryptedData: DecryptedCompensationData;
  }>> {
    if (!this.currentUserId || !this.userPassword) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    try {
      const records = await db.getUserCompensationRecords(this.currentUserId);
      const results = [];

      for (const record of records) {
        try {
          const decryptResult = await EncryptionService.decryptData(
            record.encryptedData,
            this.userPassword
          );

          if (decryptResult.success) {
            const decryptedData = JSON.parse(decryptResult.data) as DecryptedCompensationData;
            results.push({ record, decryptedData });
          } else {
            console.warn(`Failed to decrypt record ${record.id}: ${decryptResult.error}`);
          }
        } catch (error) {
          console.warn(`Error processing record ${record.id}:`, error);
        }
      }

      return results;
    } catch (error) {
      throw new LocalStorageError(
        `Failed to get compensation records: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ALL_FAILED'
      );
    }
  }

  /**
   * Update a compensation record
   */
  static async updateCompensationRecord(
    id: number,
    data: DecryptedCompensationData
  ): Promise<void> {
    if (!this.currentUserId || !this.userPassword) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    try {
      const existing = await db.compensationRecords.get(id);
      if (!existing || existing.userId !== this.currentUserId) {
        throw new LocalStorageError('Record not found', 'RECORD_NOT_FOUND');
      }

      // Encrypt the updated data
      const encryptedData = await EncryptionService.encryptData(
        JSON.stringify(data),
        this.userPassword
      );

      await db.compensationRecords.update(id, {
        encryptedData,
        syncStatus: 'pending',
      });

      // Add to sync queue
      await this.addToSyncQueue('update', 'compensationRecords', id, data);
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
    if (!this.currentUserId || !this.userPassword) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    try {
      const existing = await db.compensationRecords.get(id);
      if (!existing || existing.userId !== this.currentUserId) {
        throw new LocalStorageError('Record not found', 'RECORD_NOT_FOUND');
      }

      await db.compensationRecords.delete(id);
      
      // Add to sync queue
      await this.addToSyncQueue('delete', 'compensationRecords', id);
    } catch (error) {
      throw new LocalStorageError(
        `Failed to delete compensation record: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_FAILED'
      );
    }
  }

  /**
   * Query compensation records by date range
   */
  static async getRecordsByDateRange(
    startDate: Date,
    endDate: Date,
    type?: CompensationType
  ): Promise<Array<{
    record: CompensationRecord;
    decryptedData: DecryptedCompensationData;
  }>> {
    const allRecords = await this.getAllCompensationRecords();
    
    return allRecords.filter(({ record, decryptedData }) => {
      // Filter by type if specified
      if (type && record.type !== type) {
        return false;
      }

      // Filter by date range based on record type
      let recordDate: Date;
      
      if (record.type === 'salary') {
        const salaryData = decryptedData as DecryptedSalaryData;
        recordDate = new Date(salaryData.startDate);
      } else if (record.type === 'bonus') {
        const bonusData = decryptedData as DecryptedBonusData;
        recordDate = new Date(bonusData.date);
      } else if (record.type === 'equity') {
        const equityData = decryptedData as DecryptedEquityData;
        recordDate = new Date(equityData.grantDate);
      } else {
        return false;
      }

      return recordDate >= startDate && recordDate <= endDate;
    });
  }

  /**
   * Get user preferences
   */
  static async getUserPreferences(): Promise<UserPreferences | null> {
    if (!this.currentUserId) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    return db.getUserPreferences(this.currentUserId);
  }

  /**
   * Update user preferences
   */
  static async updateUserPreferences(
    updates: Partial<Omit<UserPreferences, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    if (!this.currentUserId) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    try {
      const existing = await db.getUserPreferences(this.currentUserId);
      if (existing) {
        await db.userPreferences.update(existing.id!, updates);
      } else {
        // This shouldn't happen if ensureUserPreferences was called
        await this.ensureUserPreferences();
      }
    } catch (error) {
      throw new LocalStorageError(
        `Failed to update user preferences: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPDATE_PREFERENCES_FAILED'
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
    if (!this.currentUserId) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    const syncItem: Omit<PendingSyncItem, 'id' | 'createdAt' | 'updatedAt'> = {
      userId: this.currentUserId,
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
  static async getPendingSyncItems(): Promise<PendingSyncItem[]> {
    if (!this.currentUserId) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    return db.getPendingSyncItems(this.currentUserId);
  }

  /**
   * Mark sync item as completed
   */
  static async markSyncCompleted(syncItemId: number): Promise<void> {
    await db.pendingSync.update(syncItemId, {
      status: 'completed',
    });
  }

  /**
   * Mark sync item as failed
   */
  static async markSyncFailed(syncItemId: number, error: string): Promise<void> {
    await db.pendingSync.update(syncItemId, {
      status: 'failed',
      error,
    });
  }

  /**
   * Get database statistics
   */
  static async getStats() {
    if (!this.currentUserId) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    return db.getStats(this.currentUserId);
  }

  /**
   * Clear all user data
   */
  static async clearUserData(): Promise<void> {
    if (!this.currentUserId) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    await db.clearUserData(this.currentUserId);
    this.clearSession();
  }

  /**
   * Export user data
   */
  static async exportUserData() {
    if (!this.currentUserId) {
      throw new LocalStorageError('User not initialized', 'USER_NOT_INITIALIZED');
    }

    return db.exportUserData(this.currentUserId);
  }
}