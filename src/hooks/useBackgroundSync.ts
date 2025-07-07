import { useState, useEffect, useCallback } from 'react';
import { SyncService } from '@/services/syncService';
import { logSyncEvent } from '@/lib/config/syncConfig';

interface BackgroundSyncState {
  isSupported: boolean;
  isEnabled: boolean;
  registeredTags: string[];
  queueSize: number;
  isRegistering: boolean;
  lastSyncTime: Date | null;
  error: string | null;
}

interface BackgroundSyncActions {
  registerSync: (operation: string, recordId: string) => Promise<boolean>;
  refreshStatus: () => Promise<void>;
  clearError: () => void;
}

/**
 * Custom hook for managing Background Sync API operations
 * 
 * Provides state and actions for:
 * - Checking browser support
 * - Registering background sync tasks
 * - Monitoring sync queue status
 * - Handling sync events from service worker
 */
export function useBackgroundSync(): BackgroundSyncState & BackgroundSyncActions {
  const [state, setState] = useState<BackgroundSyncState>({
    isSupported: false,
    isEnabled: false,
    registeredTags: [],
    queueSize: 0,
    isRegistering: false,
    lastSyncTime: null,
    error: null,
  });

  // Refresh background sync status
  const refreshStatus = useCallback(async () => {
    try {
      const status = await SyncService.getBackgroundSyncStatus();
      
      setState(prev => ({
        ...prev,
        isSupported: status.supported,
        isEnabled: status.supported,
        registeredTags: status.registered,
        queueSize: status.queueSize,
        error: null,
      }));
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({
        ...prev,
        error: errorMessage,
      }));
      
      logSyncEvent('error', 'Failed to refresh background sync status', error);
    }
  }, []);

  // Register a background sync task
  const registerSync = useCallback(async (operation: string, recordId: string): Promise<boolean> => {
    if (!state.isSupported) {
      setState(prev => ({
        ...prev,
        error: 'Background Sync API not supported in this browser',
      }));
      return false;
    }

    setState(prev => ({ ...prev, isRegistering: true, error: null }));

    try {
      const success = await SyncService.registerBackgroundSync(operation, recordId);
      
      if (success) {
        // Refresh status to get updated registered tags
        await refreshStatus();
        
        setState(prev => ({
          ...prev,
          isRegistering: false,
          lastSyncTime: new Date(),
        }));
        
        logSyncEvent('info', 'Background sync registered via hook', { operation, recordId });
      } else {
        setState(prev => ({
          ...prev,
          isRegistering: false,
          error: 'Failed to register background sync',
        }));
      }
      
      return success;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      
      setState(prev => ({
        ...prev,
        isRegistering: false,
        error: errorMessage,
      }));
      
      logSyncEvent('error', 'Background sync registration failed in hook', error);
      return false;
    }
  }, [state.isSupported, refreshStatus]);

  // Clear error state
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Handle service worker messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'sw-background-sync') {
        const { payload } = event.data;
        
        switch (payload.event) {
          case 'background-sync-registered':
            setState(prev => ({
              ...prev,
              lastSyncTime: new Date(),
            }));
            // Refresh status to get updated tags
            refreshStatus();
            break;
            
          case 'background-sync-registration-failed':
            setState(prev => ({
              ...prev,
              error: payload.error || 'Background sync registration failed',
            }));
            break;
            
          case 'sync-success':
          case 'emergency-sync-success':
            setState(prev => ({
              ...prev,
              lastSyncTime: new Date(),
              error: null,
            }));
            // Refresh status to get updated queue size
            refreshStatus();
            break;
            
          case 'sync-failed':
          case 'emergency-sync-failed':
            setState(prev => ({
              ...prev,
              error: payload.error || 'Background sync failed',
            }));
            break;
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [refreshStatus]);

  // Initialize hook
  useEffect(() => {
    // Check initial support
    const isSupported = SyncService.isBackgroundSyncSupported();
    
    setState(prev => ({
      ...prev,
      isSupported,
      isEnabled: isSupported,
    }));

    // Refresh status if supported
    if (isSupported) {
      refreshStatus();
    }
  }, [refreshStatus]);

  // Auto-refresh status periodically
  useEffect(() => {
    if (!state.isSupported) {
      return;
    }

    const interval = setInterval(() => {
      refreshStatus();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [state.isSupported, refreshStatus]);

  return {
    ...state,
    registerSync,
    refreshStatus,
    clearError,
  };
}

/**
 * Simplified hook that just checks if Background Sync is supported
 */
export function useBackgroundSyncSupported(): boolean {
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(SyncService.isBackgroundSyncSupported());
  }, []);

  return isSupported;
}

/**
 * Hook for monitoring background sync queue size
 */
export function useBackgroundSyncQueue(): {
  queueSize: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [queueSize, setQueueSize] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await SyncService.getBackgroundSyncStatus();
      setQueueSize(status.queueSize);
    } catch (error) {
      logSyncEvent('error', 'Failed to get background sync queue size', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { queueSize, isLoading, refresh };
}