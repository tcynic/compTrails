'use client';

import { useState, useEffect } from 'react';
import { useSalaryData, useBonusData, useEquityData } from './useCompensationData';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from './usePassword';

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
}

/**
 * Global loading state hook that aggregates loading states from all compensation data hooks
 * Provides unified loading experience for the dashboard
 */
export function useGlobalLoadingState(): GlobalLoadingState {
  const { user } = useAuth();
  const password = useSecurePassword();
  
  // Get loading states from all data hooks
  const { data: salaryData, loading: salaryLoading } = useSalaryData({
    autoRefresh: true,
    backgroundSync: true,
  });
  const { data: bonusData, loading: bonusLoading } = useBonusData({
    autoRefresh: true,
    backgroundSync: true,
  });
  const { data: equityData, loading: equityLoading } = useEquityData({
    autoRefresh: true,
    backgroundSync: true,
  });

  const [stage, setStage] = useState<'querying' | 'decrypting' | 'processing' | 'complete'>('querying');
  const [progress, setProgress] = useState(0);
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  // Calculate if any hook is still loading
  const isAnyLoading = salaryLoading || bonusLoading || equityLoading;
  
  // Calculate total record counts
  const recordCounts = {
    salary: salaryData.length,
    bonus: bonusData.length,
    equity: equityData.length,
    total: salaryData.length + bonusData.length + equityData.length,
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

    if (isAnyLoading) {
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
  }, [isAnyLoading, user, password]);

  // Detect first visit
  useEffect(() => {
    if (!isAnyLoading && recordCounts.total === 0) {
      setIsFirstVisit(true);
    }
  }, [isAnyLoading, recordCounts.total]);

  return {
    isInitialLoading: isAnyLoading,
    hasData,
    stage,
    progress,
    recordCounts,
    isFirstVisit,
  };
}

/**
 * Hook for individual pages to determine if they should show loading state
 * This respects the global loading state while allowing individual refreshes
 */
export function usePageLoadingState(dataType: 'salary' | 'bonus' | 'equity') {
  const globalState = useGlobalLoadingState();
  
  // Individual data hooks
  const salaryHook = useSalaryData({ autoRefresh: true, backgroundSync: true });
  const bonusHook = useBonusData({ autoRefresh: true, backgroundSync: true });
  const equityHook = useEquityData({ autoRefresh: true, backgroundSync: true });
  
  const hookMap = {
    salary: salaryHook,
    bonus: bonusHook,
    equity: equityHook,
  };
  
  const currentHook = hookMap[dataType];
  
  return {
    // Show loading if global initial load or individual refresh
    isLoading: globalState.isInitialLoading || currentHook.loading,
    // Use global loading for initial load, individual loading for refreshes
    showGlobalLoading: globalState.isInitialLoading,
    showIndividualLoading: !globalState.isInitialLoading && currentHook.loading,
    data: currentHook.data,
    refetch: currentHook.refetch,
    hasData: currentHook.data.length > 0,
    globalState,
  };
}