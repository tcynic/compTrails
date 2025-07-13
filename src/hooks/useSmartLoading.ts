import { useState, useEffect, useRef } from 'react';

interface SmartLoadingOptions {
  /**
   * Minimum time (in ms) before showing loading screen
   * Operations faster than this will show skeleton instead
   */
  minLoadingTime?: number;
  
  /**
   * Show skeleton for fast operations instead of loading screen
   */
  useSkeletonForFast?: boolean;
}

export interface SmartLoadingState {
  /** Whether to show heavy loading screen */
  showLoadingScreen: boolean;
  
  /** Whether to show lightweight skeleton */
  showSkeleton: boolean;
  
  /** Whether any loading is happening */
  isLoading: boolean;
}

/**
 * Smart loading hook that prevents jarring loading screens for fast operations
 * 
 * - Shows skeleton for operations under threshold (default 150ms)
 * - Shows full loading screen only for genuinely slow operations
 * - Prevents loading flicker for cached data
 */
export function useSmartLoading(
  isLoading: boolean,
  options: SmartLoadingOptions = {}
): SmartLoadingState {
  const {
    minLoadingTime = 150, // 150ms threshold
    useSkeletonForFast = true,
  } = options;

  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Mark loading start time
      startTimeRef.current = Date.now();
      
      // Immediately show skeleton if enabled
      if (useSkeletonForFast) {
        setShowSkeleton(true);
      }
      
      // Set timeout to show loading screen if operation takes too long
      timeoutRef.current = setTimeout(() => {
        setShowSkeleton(false);
        setShowLoadingScreen(true);
      }, minLoadingTime);
      
    } else {
      // Loading finished - clear states
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      setShowLoadingScreen(false);
      setShowSkeleton(false);
      
      // Log performance for debugging
      if (startTimeRef.current) {
        const loadTime = Date.now() - startTimeRef.current;
        if (loadTime < 50) {
          console.log(`[useSmartLoading] INSTANT loading: ${loadTime}ms`);
        } else if (loadTime < minLoadingTime) {
          console.log(`[useSmartLoading] Fast loading (skeleton): ${loadTime}ms`);
        } else {
          console.log(`[useSmartLoading] Slow loading (full screen): ${loadTime}ms`);
        }
        startTimeRef.current = null;
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isLoading, minLoadingTime, useSkeletonForFast]);

  return {
    showLoadingScreen,
    showSkeleton,
    isLoading,
  };
}