/**
 * Optimized page state hook that replaces the old GlobalLoadingContext approach
 * Uses the new performance-optimized summary hooks for fast loading
 */

import { useMemo } from 'react';
import { useCompensationSummaries, type CompensationSummary } from './useCompensationSummaries';
import { useSmartLoading } from './useSmartLoading';
import type { CompensationType } from '@/lib/db/types';

interface OptimizedPageState {
  /** Optimized loading states */
  isLoading: boolean;
  showLoadingScreen: boolean;
  showSkeleton: boolean;
  
  /** Filtered data for the page */
  data: CompensationSummary[];
  hasData: boolean;
  
  /** Error state */
  error: string | null;
  
  /** Simple refetch method */
  refetch: () => void;
}

/**
 * Optimized hook for individual pages that provides type-filtered data
 * with performance optimizations and smart loading states
 */
export function useOptimizedPageState(dataType: CompensationType): OptimizedPageState {
  // Use the optimized summaries hook
  const { summaries, loading, error } = useCompensationSummaries();
  
  // Smart loading states
  const { showLoadingScreen, showSkeleton, isLoading } = useSmartLoading(loading, {
    minLoadingTime: 150,
    useSkeletonForFast: true,
  });
  
  // Filter data by type
  const filteredData = useMemo(() => {
    return summaries.filter(item => item.type === dataType);
  }, [summaries, dataType]);
  
  // Simple refetch method
  const refetch = () => {
    // For now, just refresh the page
    // In the future, we could implement cache invalidation + reload
    window.location.reload();
  };
  
  return {
    isLoading,
    showLoadingScreen,
    showSkeleton,
    data: filteredData,
    hasData: filteredData.length > 0,
    error,
    refetch,
  };
}

