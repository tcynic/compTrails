'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useCompensationData } from '@/hooks/useCompensationData';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurePassword } from '@/hooks/usePassword';
import { useState, useEffect } from 'react';
import type { DecryptedCompensationRecord } from '@/hooks/useCompensationData';

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

const GlobalLoadingContext = createContext<GlobalLoadingState | null>(null);

interface GlobalLoadingProviderProps {
  children: ReactNode;
}

/**
 * CRITICAL FIX: Single global loading state provider
 * This prevents multiple useCompensationData hook instances that were causing:
 * - Duplicate 5+ second decryption operations
 * - Multiple hook instances with different IDs (9rwwok, bjyo0j, etc.)
 * - Performance issues from redundant operations
 */
export function GlobalLoadingProvider({ children }: GlobalLoadingProviderProps) {
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

  const value: GlobalLoadingState = {
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

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoadingContext(): GlobalLoadingState {
  const context = useContext(GlobalLoadingContext);
  if (!context) {
    throw new Error('useGlobalLoadingContext must be used within a GlobalLoadingProvider');
  }
  return context;
}