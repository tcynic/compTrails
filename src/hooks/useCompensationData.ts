"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from '@/hooks/usePassword';
import { LocalStorageService } from '@/services/localStorageService';
import { EncryptionService } from '@/services/encryptionService';
import { SyncService } from '@/services/syncService';
import { sessionDataCache } from '@/services/sessionDataCache';
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
  
  // Memoize stable values to prevent unnecessary re-renders
  const stableUserId = useMemo(() => user?.id, [user?.id]);
  const hasPassword = useMemo(() => !!password, [password]);
  
  // Ref to prevent multiple simultaneous loads
  const isLoadingRef = useRef(false);
  const lastLoadTimeRef = useRef<number>(0);
  const instanceIdRef = useRef(Math.random().toString(36).substring(2, 8));
  
  /**
   * Filter cached full records by type if needed
   */
  const filterCachedRecordsByType = useCallback((records: DecryptedCompensationRecord[], requestedType?: CompensationType): DecryptedCompensationRecord[] => {
    if (!requestedType) return records;
    return records.filter(record => record.type === requestedType);
  }, []);
  
  // Enhanced debugging state (used in effect below)
  // const debugInfo = {
  //   userId: user?.id || 'null',
  //   hasPassword: !!password,
  //   isOnline: navigator?.onLine ?? false,
  //   hookType: type || 'all',
  //   backgroundSync,
  //   autoRefresh,
  // };
  
  // Log authentication and password state for debugging (only when values change)
  useEffect(() => {
    console.log(`[useCompensationData:${type || 'all'}] Hook state:`, {
      userId: stableUserId || 'null',
      hasPassword,
      isOnline: navigator?.onLine ?? false,
      hookType: type || 'all',
      backgroundSync,
      autoRefresh,
    });
  }, [stableUserId, hasPassword, type, backgroundSync, autoRefresh]);
  
  /**
   * Load data from local storage (IndexedDB) - PRIMARY DATA SOURCE
   * This follows the local-first architecture principle
   */
  const loadDataFromLocal = useCallback(async (): Promise<DecryptedCompensationRecord[]> => {
    if (!stableUserId) {
      throw new Error('User not authenticated');
    }
    
    if (!password) {
      throw new Error('Password not available for decryption');
    }
    
    // Load from IndexedDB (local-first)
    const records = await LocalStorageService.getCompensationRecords(stableUserId, type);
    
    if (records.length === 0) {
      return [];
    }
    
    // Batch decrypt for performance with unique timer identifier
    const encryptedDataArray = records.map(record => record.encryptedData);
    const timerPrefix = `useCompensationData[${type || 'all'}]-${instanceIdRef.current}`;
    const decryptResults = await EncryptionService.batchDecryptData(encryptedDataArray, password, { timerPrefix });
    
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
    
    // Filter out failed decryptions and apply proper sorting
    const validRecords = (decryptedRecords.filter(Boolean) as DecryptedCompensationRecord[])
      .sort((a, b) => {
        // For salary records, implement business-specific sorting
        if (type === 'salary' && a.decryptedData && b.decryptedData) {
          const aData = a.decryptedData as any; // DecryptedSalaryData
          const bData = b.decryptedData as any; // DecryptedSalaryData
          
          // Primary sort: Current salary always comes first
          if (aData.isCurrentPosition && !bData.isCurrentPosition) return -1;
          if (!aData.isCurrentPosition && bData.isCurrentPosition) return 1;
          
          // Secondary sort: For non-current salaries, sort by start date (newest first)
          if (!aData.isCurrentPosition && !bData.isCurrentPosition) {
            if (aData.startDate && bData.startDate) {
              return new Date(bData.startDate).getTime() - new Date(aData.startDate).getTime();
            }
          }
        }
        
        // Fallback sort: By creation date (newest first) for all other cases
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    
    return validRecords;
  }, [stableUserId, password, type]);
  
  /**
   * Main data loading function
   * Implements local-first loading with full record caching and background sync
   */
  const loadData = useCallback(async () => {
    if (!stableUserId || !password || isLoadingRef.current) {
      console.log(`[useCompensationData:${type || 'all'}] Skipping load - userId: ${!!stableUserId}, password: ${!!password}, loading: ${isLoadingRef.current}`);
      return;
    }
    
    try {
      isLoadingRef.current = true;
      setError(null);
      
      // TIER 1: Check session cache for full records first (instant loading)
      const cachedFullRecords = sessionDataCache.getFullRecords(stableUserId);
      if (cachedFullRecords) {
        // Filter by type if needed
        const filteredCachedRecords = filterCachedRecordsByType(cachedFullRecords, type);
        
        setData(filteredCachedRecords);
        setLoading(false);
        setIsStale(false);
        console.log(`[useCompensationData:${type || 'all'}] Loaded ${filteredCachedRecords.length} records from session cache (instant)`);
        
        // Still trigger background sync to keep data fresh
        if (backgroundSync && navigator.onLine) {
          SyncService.triggerBidirectionalSync(stableUserId, password)
            .then(() => {
              sessionDataCache.invalidateUser(stableUserId);
            })
            .catch(error => console.warn('[useCompensationData] Background sync failed:', error));
        }
        
        lastLoadTimeRef.current = Date.now();
        isLoadingRef.current = false;
        return;
      }
      
      // TIER 2: Load from IndexedDB and cache full records for future use
      const localData = await loadDataFromLocal();
      
      // Cache full records for future instant loading (only if loading all data)
      if (!type && localData.length > 0) {
        sessionDataCache.setFullRecords(stableUserId, localData);
        console.log(`[useCompensationData:${type || 'all'}] Cached ${localData.length} full records for future instant loading`);
      }
      
      // Check if we have no local data - trigger initial pull from Convex
      const hasNoLocalData = localData.length === 0;
      
      if (hasNoLocalData && backgroundSync && navigator.onLine) {
        console.log(`[useCompensationData] No local ${type || 'compensation'} data found, triggering initial pull from Convex`);
        
        try {
          // Use bidirectional sync to pull data from Convex first
          await SyncService.triggerBidirectionalSync(stableUserId, password);
          
          // Reload data after sync
          const syncedData = await loadDataFromLocal();
          setData(syncedData);
          setLoading(false);
          setIsStale(false);
          
          // Cache the new synced data and invalidate old session cache
          sessionDataCache.invalidateUser(stableUserId);
          if (!type && syncedData.length > 0) {
            sessionDataCache.setFullRecords(stableUserId, syncedData);
          }
          
          console.log(`[useCompensationData] Initial sync completed: ${syncedData.length} records loaded`);
          
        } catch (syncError) {
          console.error(`[useCompensationData] Initial sync failed:`, syncError);
          // Still show whatever local data we have (which might be empty)
          setData(localData);
          setLoading(false);
          setIsStale(true);
          setError('Failed to sync data from server. Working in offline mode.');
        }
      } else {
        // We have local data, update UI immediately
        setData(localData);
        setLoading(false);
        
        // BACKGROUND SYNC: Trigger bidirectional sync if enabled
        if (backgroundSync && navigator.onLine) {
          try {
            // Use bidirectional sync for background updates - this doesn't block UI
            SyncService.triggerBidirectionalSync(stableUserId, password)
              .then(() => {
                // Invalidate session cache after background sync
                sessionDataCache.invalidateUser(stableUserId);
              });
            
            // Check if we need to reload after sync with proper cleanup
            setTimeout(async () => {
              try {
                // Only refresh if we're still in the same loading session
                if (!isLoadingRef.current) {
                  const updatedData = await loadDataFromLocal();
                  if (JSON.stringify(updatedData) !== JSON.stringify(localData)) {
                    setData(updatedData);
                    setIsStale(false);
                    
                    // Update cached full records after background sync
                    if (!type && updatedData.length > 0) {
                      sessionDataCache.setFullRecords(stableUserId, updatedData);
                    }
                    
                    console.log(`[useCompensationData] Background sync updated data: ${updatedData.length} records`);
                  }
                }
              } catch (syncError) {
                console.warn('[useCompensationData] Background data refresh failed:', syncError);
                setIsStale(true);
              }
            }, 2000); // Give bidirectional sync more time to complete
            
          } catch (syncError) {
            console.warn('[useCompensationData] Background sync failed:', syncError);
            setIsStale(true);
          }
        }
      }
      
      lastLoadTimeRef.current = Date.now();
      
    } catch (loadError) {
      console.error(`Error loading ${type || 'compensation'} data:`, loadError);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load data');
      setLoading(false);
    } finally {
      isLoadingRef.current = false;
    }
  }, [stableUserId, password, type, backgroundSync, loadDataFromLocal, filterCachedRecordsByType]);
  
  /**
   * Manual refetch function
   */
  const refetch = useCallback(async () => {
    setLoading(true);
    await loadData();
  }, [loadData]);
  
  // Initial load on mount and when dependencies change
  useEffect(() => {
    if (stableUserId && password) {
      loadData();
    }
  }, [stableUserId, password, type, loadData]);
  
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