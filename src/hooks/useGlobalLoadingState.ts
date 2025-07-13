'use client';

import { useGlobalLoadingContext } from '@/contexts/GlobalLoadingContext';
import type { DecryptedCompensationRecord } from './useCompensationData';

interface GlobalLoadingState {
  isInitialLoading: boolean;
  hasData: boolean;
  stage: 'querying' | 'decrypting' | 'processing' | 'complete';
  progress: number;
  recordCounts: {
    salary: number;
    bonus: number;
    equity: number;
    total: number;
  };
  isFirstVisit: boolean;
  // Expose filtered data for reuse
  salaryData: DecryptedCompensationRecord[];
  bonusData: DecryptedCompensationRecord[];
  equityData: DecryptedCompensationRecord[];
  allData: DecryptedCompensationRecord[];
}

/**
 * CRITICAL FIX: Use context-based global loading state
 * This prevents multiple useCompensationData hook instances
 */
export function useGlobalLoadingState(): GlobalLoadingState {
  return useGlobalLoadingContext();
}

/**
 * Hook for individual pages to determine if they should show loading state
 * This reuses the global state data to prevent redundant operations
 */
export function usePageLoadingState(dataType: 'salary' | 'bonus' | 'equity') {
  const globalState = useGlobalLoadingState();
  
  // Use data from the global state instead of creating new hooks
  const dataMap = {
    salary: globalState.salaryData,
    bonus: globalState.bonusData,
    equity: globalState.equityData,
  };
  
  const currentData = dataMap[dataType];
  
  return {
    // Use global loading state only
    isLoading: globalState.isInitialLoading,
    showGlobalLoading: globalState.isInitialLoading,
    showIndividualLoading: false, // No individual loading since we reuse global data
    data: currentData,
    refetch: () => {
      // For individual refreshes, we would need to implement a global refetch
      // For now, page refresh will trigger global reload
      console.log(`Refetch requested for ${dataType} data`);
      window.location.reload();
    },
    hasData: currentData.length > 0,
    globalState,
  };
}