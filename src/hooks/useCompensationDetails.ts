/**
 * Lazy Compensation Details Hook
 * 
 * Provides full compensation record details on-demand when users need
 * complete information (editing, detailed views, etc.). This complements
 * useCompensationSummaries by providing lazy loading of detailed data.
 * 
 * Performance benefits:
 * - Only loads full details when explicitly requested
 * - Caches loaded details to avoid re-decryption
 * - Maintains same security model as full data loading
 */

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from '@/hooks/usePassword';
import { LocalStorageService } from '@/services/localStorageService';
import { EncryptionService } from '@/services/encryptionService';
import type { 
  CompensationRecord, 
  DecryptedSalaryData, 
  DecryptedBonusData, 
  DecryptedEquityData 
} from '@/lib/db/types';

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export interface DecryptedCompensationRecord extends CompensationRecord {
  decryptedData: DecryptedSalaryData | DecryptedBonusData | DecryptedEquityData;
}

interface DetailCache {
  [recordId: number]: {
    record: DecryptedCompensationRecord;
    loadedAt: number;
    expiresAt: number;
  };
}

interface DetailsState {
  cache: DetailCache;
  loading: Set<number>; // Track which records are currently loading
  errors: Map<number, string>; // Track errors by record ID
}

/**
 * Hook for lazy loading full compensation record details
 */
export function useCompensationDetails() {
  const { user } = useAuth();
  const password = useSecurePassword();
  const [state, setState] = useState<DetailsState>({
    cache: {},
    loading: new Set(),
    errors: new Map(),
  });
  
  const instanceIdRef = useRef(Math.random().toString(36).substring(2, 8));

  /**
   * Load full details for a specific record
   */
  const loadRecordDetails = useCallback(async (
    recordId: number
  ): Promise<DecryptedCompensationRecord | null> => {
    if (!user?.id || !password) {
      throw new Error('User not authenticated or password not available');
    }

    // Check cache first
    const cached = state.cache[recordId];
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[useCompensationDetails] Cache HIT for record ${recordId}`);
      return cached.record;
    }

    // Check if already loading
    if (state.loading.has(recordId)) {
      console.log(`[useCompensationDetails] Record ${recordId} already loading`);
      return null;
    }

    // Mark as loading
    setState(prev => ({
      ...prev,
      loading: new Set([...prev.loading, recordId]),
      errors: new Map([...prev.errors].filter(([id]) => id !== recordId)),
    }));

    try {
      console.time(`[useCompensationDetails] Load record ${recordId} - ${instanceIdRef.current}`);
      
      // Load all records to find the specific one
      // This is still efficient because we use the key cache for decryption
      const records = await LocalStorageService.getCompensationRecords(user.id);
      const targetRecord = records.find(r => r.id === recordId);
      
      if (!targetRecord) {
        throw new Error(`Record ${recordId} not found`);
      }

      // Decrypt just this one record using batch method for timerPrefix support
      const timerPrefix = `useCompensationDetails[${recordId}]-${instanceIdRef.current}`;
      const decryptResults = await EncryptionService.batchDecryptData(
        [targetRecord.encryptedData],
        password,
        { timerPrefix }
      );
      const decryptResult = decryptResults[0];

      if (!decryptResult.success) {
        throw new Error(`Decryption failed: ${decryptResult.error}`);
      }

      // Parse decrypted data
      const decryptedData = JSON.parse(decryptResult.data);
      const fullRecord: DecryptedCompensationRecord = {
        ...targetRecord,
        decryptedData,
      };

      // Cache the result
      const now = Date.now();
      setState(prev => ({
        ...prev,
        cache: {
          ...prev.cache,
          [recordId]: {
            record: fullRecord,
            loadedAt: now,
            expiresAt: now + CACHE_TTL,
          },
        },
        loading: new Set([...prev.loading].filter(id => id !== recordId)),
      }));

      console.timeEnd(`[useCompensationDetails] Load record ${recordId} - ${instanceIdRef.current}`);
      console.log(`[useCompensationDetails] Loaded and cached record ${recordId}`);

      return fullRecord;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load record details';
      console.error(`[useCompensationDetails] Error loading record ${recordId}:`, error);

      setState(prev => ({
        ...prev,
        loading: new Set([...prev.loading].filter(id => id !== recordId)),
        errors: new Map([...prev.errors, [recordId, errorMessage]]),
      }));

      throw error;
    }
  }, [user?.id, password, state.cache, state.loading]);

  /**
   * Load multiple records in batch (more efficient)
   */
  const loadMultipleRecordDetails = useCallback(async (
    recordIds: number[]
  ): Promise<Map<number, DecryptedCompensationRecord>> => {
    if (!user?.id || !password) {
      throw new Error('User not authenticated or password not available');
    }

    const results = new Map<number, DecryptedCompensationRecord>();
    const uncachedIds: number[] = [];

    // Check cache for each record
    for (const recordId of recordIds) {
      const cached = state.cache[recordId];
      if (cached && cached.expiresAt > Date.now()) {
        results.set(recordId, cached.record);
      } else {
        uncachedIds.push(recordId);
      }
    }

    if (uncachedIds.length === 0) {
      console.log(`[useCompensationDetails] All ${recordIds.length} records found in cache`);
      return results;
    }

    // Load uncached records
    console.time(`[useCompensationDetails] Batch load ${uncachedIds.length} records - ${instanceIdRef.current}`);
    
    try {
      // Mark all as loading
      setState(prev => ({
        ...prev,
        loading: new Set([...prev.loading, ...uncachedIds]),
      }));

      // Load all records and filter to requested ones
      const allRecords = await LocalStorageService.getCompensationRecords(user.id);
      const targetRecords = allRecords.filter(r => uncachedIds.includes(r.id!));

      if (targetRecords.length !== uncachedIds.length) {
        console.warn(`[useCompensationDetails] Found ${targetRecords.length} of ${uncachedIds.length} requested records`);
      }

      // Batch decrypt
      const encryptedDataArray = targetRecords.map(record => record.encryptedData);
      const timerPrefix = `useCompensationDetails[batch]-${instanceIdRef.current}`;
      const decryptResults = await EncryptionService.batchDecryptData(
        encryptedDataArray, 
        password, 
        { timerPrefix }
      );

      // Process results and update cache
      const newCacheEntries: DetailCache = {};
      const now = Date.now();

      for (let i = 0; i < targetRecords.length; i++) {
        const record = targetRecords[i];
        const decryptResult = decryptResults[i];
        
        if (decryptResult.success) {
          try {
            const decryptedData = JSON.parse(decryptResult.data);
            const fullRecord: DecryptedCompensationRecord = {
              ...record,
              decryptedData,
            };

            results.set(record.id!, fullRecord);
            newCacheEntries[record.id!] = {
              record: fullRecord,
              loadedAt: now,
              expiresAt: now + CACHE_TTL,
            };
          } catch (parseError) {
            console.error(`[useCompensationDetails] Failed to parse record ${record.id}:`, parseError);
          }
        } else {
          console.error(`[useCompensationDetails] Failed to decrypt record ${record.id}:`, decryptResult.error);
        }
      }

      // Update state with new cache entries
      setState(prev => ({
        ...prev,
        cache: { ...prev.cache, ...newCacheEntries },
        loading: new Set([...prev.loading].filter(id => !uncachedIds.includes(id))),
      }));

      console.timeEnd(`[useCompensationDetails] Batch load ${uncachedIds.length} records - ${instanceIdRef.current}`);
      console.log(`[useCompensationDetails] Loaded ${Object.keys(newCacheEntries).length} new records into cache`);

      return results;

    } catch (error) {
      console.error('[useCompensationDetails] Batch load error:', error);
      
      // Clear loading state for failed records
      setState(prev => ({
        ...prev,
        loading: new Set([...prev.loading].filter(id => !uncachedIds.includes(id))),
      }));

      throw error;
    }
  }, [user?.id, password, state.cache]);

  /**
   * Get cached record if available (doesn't trigger loading)
   */
  const getCachedRecord = useCallback((recordId: number): DecryptedCompensationRecord | null => {
    const cached = state.cache[recordId];
    if (cached && cached.expiresAt > Date.now()) {
      return cached.record;
    }
    return null;
  }, [state.cache]);

  /**
   * Check if record is currently loading
   */
  const isRecordLoading = useCallback((recordId: number): boolean => {
    return state.loading.has(recordId);
  }, [state.loading]);

  /**
   * Get error for specific record
   */
  const getRecordError = useCallback((recordId: number): string | null => {
    return state.errors.get(recordId) || null;
  }, [state.errors]);

  /**
   * Clear cache (useful for memory management)
   */
  const clearCache = useCallback(() => {
    setState({
      cache: {},
      loading: new Set(),
      errors: new Map(),
    });
    console.log('[useCompensationDetails] Cache cleared');
  }, []);

  /**
   * Clear expired cache entries
   */
  const cleanupExpiredCache = useCallback(() => {
    const now = Date.now();
    const validEntries: DetailCache = {};
    let expiredCount = 0;

    for (const [recordId, entry] of Object.entries(state.cache)) {
      if (entry.expiresAt > now) {
        validEntries[parseInt(recordId)] = entry;
      } else {
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      setState(prev => ({
        ...prev,
        cache: validEntries,
      }));
      console.log(`[useCompensationDetails] Cleaned up ${expiredCount} expired cache entries`);
    }
  }, [state.cache]);

  return {
    // Main methods
    loadRecordDetails,
    loadMultipleRecordDetails,
    
    // Query methods
    getCachedRecord,
    isRecordLoading,
    getRecordError,
    
    // Management methods
    clearCache,
    cleanupExpiredCache,
    
    // State
    cacheSize: Object.keys(state.cache).length,
    loadingCount: state.loading.size,
    errorCount: state.errors.size,
  };
}