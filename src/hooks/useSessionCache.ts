/**
 * Session Cache Hook
 * 
 * Provides utilities for managing session cache from components.
 * Used to invalidate cache when users make changes to compensation data.
 */

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { sessionDataCache } from '@/services/sessionDataCache';

export function useSessionCache() {
  const { user } = useAuth();

  /**
   * Invalidate session cache for current user
   * Call this when user makes changes to compensation data
   */
  const invalidateCache = useCallback(() => {
    if (user?.id) {
      sessionDataCache.invalidateUser(user.id);
      console.log('[useSessionCache] Cache invalidated for user after data change');
    }
  }, [user?.id]);

  /**
   * Clear all session cache
   * Call this on logout or critical errors
   */
  const clearAllCache = useCallback(() => {
    sessionDataCache.clearAll();
    console.log('[useSessionCache] All cache cleared');
  }, []);

  /**
   * Get cache statistics for debugging
   */
  const getCacheStats = useCallback(() => {
    return sessionDataCache.getStats();
  }, []);

  /**
   * Check if user has cached data
   */
  const hasCachedData = useCallback(() => {
    if (!user?.id) return false;
    return sessionDataCache.hasCachedSummaries(user.id);
  }, [user?.id]);

  return {
    invalidateCache,
    clearAllCache,
    getCacheStats,
    hasCachedData,
  };
}