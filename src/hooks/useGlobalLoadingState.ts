'use client';

// Temporary fallback to prevent build errors
// This file will be removed once all components are migrated to useOptimizedPageState
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
 * DEPRECATED: Temporary fallback to prevent build errors
 * Use useOptimizedPageState instead
 */
export function useGlobalLoadingState(): GlobalLoadingState {
  // Return a fallback state to prevent build errors
  return {
    isInitialLoading: false,
    hasData: true,
    stage: 'complete',
    progress: 100,
    recordCounts: { salary: 0, bonus: 0, equity: 0, total: 0 },
    isFirstVisit: false,
    salaryData: [],
    bonusData: [],
    equityData: [],
    allData: [],
  };
}

/**
 * DEPRECATED: Temporary fallback to prevent build errors
 * Use useOptimizedPageState from '@/hooks/useOptimizedPageState' instead
 */
export function usePageLoadingState(dataType: 'salary' | 'bonus' | 'equity') {
  console.warn(`usePageLoadingState is deprecated. Use useOptimizedPageState instead for ${dataType}`);
  
  // Return minimal fallback state to prevent build errors
  return {
    isLoading: false,
    showGlobalLoading: false,
    showIndividualLoading: false,
    data: [], // Empty data to prevent errors
    refetch: () => {
      console.log(`Deprecated refetch called for ${dataType} data`);
      window.location.reload();
    },
    hasData: false,
    globalState: {
      isInitialLoading: false,
      hasData: false,
      stage: 'complete' as const,
      progress: 100,
      recordCounts: { salary: 0, bonus: 0, equity: 0, total: 0 },
      isFirstVisit: false,
      salaryData: [],
      bonusData: [],
      equityData: [],
      allData: [],
    },
  };
}