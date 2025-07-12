"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from '@/hooks/usePassword';
import { LocalStorageService } from '@/services/localStorageService';
import { EncryptionService } from '@/services/encryptionService';
import { SyncService } from '@/services/syncService';
import type { 
  CompensationRecord, 
  CompensationType, 
  DecryptedSalaryData, 
  DecryptedBonusData, 
  DecryptedEquityData 
} from '@/lib/db/types';

// Union type for all decrypted data types
export type DecryptedCompensationData = DecryptedSalaryData | DecryptedBonusData | DecryptedEquityData;

export interface DecryptedCompensationRecord extends CompensationRecord {
  decryptedData: DecryptedCompensationData;
}

interface UseCompensationDataOptions {
  type?: CompensationType;
  autoRefresh?: boolean;
  backgroundSync?: boolean;
}

interface UseCompensationDataReturn {
  data: DecryptedCompensationRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isStale: boolean;
}

/**
 * Local-first data loading hook for compensation records
 * 
 * This hook implements the true local-first architecture by:
 * 1. Loading data from IndexedDB immediately (no network dependency)
 * 2. Providing instant UI updates (<50ms response time)
 * 3. Background syncing with Convex for cross-device consistency
 * 4. Automatic batch decryption for performance
 * 5. Consistent error handling and loading states
 */
export function useCompensationData(
  options: UseCompensationDataOptions = {}
): UseCompensationDataReturn {
  const { type, autoRefresh = true, backgroundSync = true } = options;
  
  const [data, setData] = useState<DecryptedCompensationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  
  const { user } = useAuth();
  const password = useSecurePassword();
  
  // Ref to prevent multiple simultaneous loads
  const isLoadingRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  
  /**
   * Load data from local storage (IndexedDB) - PRIMARY DATA SOURCE
   * This follows the local-first architecture principle
   */
  const loadDataFromLocal = useCallback(async (): Promise<DecryptedCompensationRecord[]> => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }
    
    if (!password) {
      throw new Error('Password not available for decryption');
    }
    
    // Load from IndexedDB (local-first)
    const records = await LocalStorageService.getCompensationRecords(user.id, type);
    
    if (records.length === 0) {
      return [];
    }
    
    // Batch decrypt for performance (as used in existing components)
    console.time(`[useCompensationData] Batch decryption - ${type || 'all'} - ${records.length} records`);
    const encryptedDataArray = records.map(record => record.encryptedData);
    const decryptResults = await EncryptionService.batchDecryptData(encryptedDataArray, password);
    console.timeEnd(`[useCompensationData] Batch decryption - ${type || 'all'} - ${records.length} records`);
    
    // Process decryption results
    const decryptedRecords = records.map((record, index) => {
      const decryptResult = decryptResults[index];
      if (decryptResult.success) {
        try {
          const decryptedData = JSON.parse(decryptResult.data) as DecryptedCompensationData;
          return { ...record, decryptedData };
        } catch (parseError) {
          console.error(`Error parsing decrypted ${type || 'compensation'} data:`, parseError);
          return null;
        }
      } else {
        console.error(`Error decrypting ${type || 'compensation'} record:`, decryptResult.error);
        return null;
      }
    });
    
    // Filter out failed decryptions and sort by creation date (newest first)
    const validRecords = (decryptedRecords.filter(Boolean) as DecryptedCompensationRecord[])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return validRecords;
  }, [user?.id, password, type]);
  
  /**
   * Main data loading function
   * Implements local-first loading with background sync
   */
  const loadData = useCallback(async () => {
    if (!user?.id || !password || isLoadingRef.current) {
      return;
    }
    
    try {
      isLoadingRef.current = true;
      setError(null);
      
      // LOCAL-FIRST: Load from IndexedDB immediately
      const localData = await loadDataFromLocal();
      setData(localData);
      setLoading(false); // UI updates immediately with local data
      lastLoadTimeRef.current = Date.now();
      
      // BACKGROUND SYNC: Trigger sync with Convex if enabled
      if (backgroundSync && navigator.onLine) {
        try {
          // Trigger background sync - this doesn't block UI
          SyncService.triggerSync(user.id);
          
          // Check if we need to reload after sync
          setTimeout(async () => {
            try {
              const updatedData = await loadDataFromLocal();
              if (JSON.stringify(updatedData) !== JSON.stringify(localData)) {
                setData(updatedData);
                setIsStale(false);
              }
            } catch (syncError) {
              console.warn('Background data refresh failed:', syncError);
              setIsStale(true);
            }
          }, 1000); // Give sync time to complete
          
        } catch (syncError) {
          console.warn('Background sync failed:', syncError);
          setIsStale(true);
        }
      }
      
    } catch (loadError) {
      console.error(`Error loading ${type || 'compensation'} data:`, loadError);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load data');
      setLoading(false);
    } finally {
      isLoadingRef.current = false;
    }
  }, [user?.id, password, type, backgroundSync, loadDataFromLocal]);
  
  /**
   * Manual refetch function
   */
  const refetch = useCallback(async () => {
    setLoading(true);
    await loadData();
  }, [loadData]);
  
  // Initial load on mount and when dependencies change
  useEffect(() => {
    if (user?.id && password) {
      loadData();
    }
  }, [user?.id, password, loadData]);
  
  // Auto-refresh on window focus if enabled
  useEffect(() => {
    if (!autoRefresh) return;
    
    const handleFocus = () => {
      const timeSinceLastLoad = Date.now() - lastLoadTimeRef.current;
      // Only auto-refresh if it's been more than 30 seconds
      if (timeSinceLastLoad > 30000) {
        loadData();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [autoRefresh, loadData]);
  
  // Online/offline event handling
  useEffect(() => {
    const handleOnline = () => {
      if (backgroundSync) {
        loadData();
      }
    };
    
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [backgroundSync, loadData]);
  
  return {
    data,
    loading,
    error,
    refetch,
    isStale,
  };
}

/**
 * Specialized hook for salary data
 */
export function useSalaryData(options: Omit<UseCompensationDataOptions, 'type'> = {}) {
  return useCompensationData({ ...options, type: 'salary' });
}

/**
 * Specialized hook for bonus data
 */
export function useBonusData(options: Omit<UseCompensationDataOptions, 'type'> = {}) {
  return useCompensationData({ ...options, type: 'bonus' });
}

/**
 * Specialized hook for equity data
 */
export function useEquityData(options: Omit<UseCompensationDataOptions, 'type'> = {}) {
  return useCompensationData({ ...options, type: 'equity' });
}