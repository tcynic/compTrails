'use client';

import { useState, useEffect } from 'react';
import { useCompensationData } from './useCompensationData';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from './usePassword';
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
 * Global loading state hook that uses a SINGLE compensation data hook
 * Provides unified loading experience for the dashboard without redundant operations
 */
export function useGlobalLoadingState(): GlobalLoadingState {
  const { user } = useAuth();
  const password = useSecurePassword();
  
  // Use a SINGLE hook for all compensation data to prevent multiple concurrent operations
  const { data: allCompensationData, loading: isLoading } = useCompensationData({
    autoRefresh: true,
    backgroundSync: true,
  });

  const [stage, setStage] = useState<'querying' | 'decrypting' | 'processing' | 'complete'>('querying');
  const [progress, setProgress] = useState(0);
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  // Filter data by type from the single source
  const salaryData = allCompensationData.filter(record => record.type === 'salary');
  const bonusData = allCompensationData.filter(record => record.type === 'bonus');
  const equityData = allCompensationData.filter(record => record.type === 'equity');
  
  // Calculate total record counts
  const recordCounts = {
    salary: salaryData.length,
    bonus: bonusData.length,
    equity: equityData.length,
    total: allCompensationData.length,
  };

  // Determine if this is the user's first visit (no data)
  const hasData = recordCounts.total > 0;

  // Handle loading stages and progress
  useEffect(() => {
    if (!user || !password) {
      setStage('querying');
      setProgress(0);
      return;
    }

    if (isLoading) {
      // Simulate progress through stages
      // Stage 1: Querying (0-30%)
      setStage('querying');
      const queryTimer = setTimeout(() => {
        setProgress(30);
        setStage('decrypting');
        
        // Stage 2: Decrypting (30-80%)
        const decryptTimer = setTimeout(() => {
          setProgress(80);
          setStage('processing');
          
          // Stage 3: Processing (80-100%)
          const processTimer = setTimeout(() => {
            setProgress(100);
            
            // Final stage: Complete
            const completeTimer = setTimeout(() => {
              setStage('complete');
            }, 200);
            
            return () => clearTimeout(completeTimer);
          }, 300);
          
          return () => clearTimeout(processTimer);
        }, 500);
        
        return () => clearTimeout(decryptTimer);
      }, 300);
      
      return () => clearTimeout(queryTimer);
    } else {
      // Data loaded, set to complete
      setStage('complete');
      setProgress(100);
    }
  }, [isLoading, user, password]);

  // Detect first visit
  useEffect(() => {
    if (!isLoading && recordCounts.total === 0) {
      setIsFirstVisit(true);
    }
  }, [isLoading, recordCounts.total]);

  return {
    isInitialLoading: isLoading,
    hasData,
    stage,
    progress,
    recordCounts,
    isFirstVisit,
    // Expose the filtered data for reuse
    salaryData,
    bonusData,
    equityData,
    allData: allCompensationData,
  };
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