'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { type ServiceWorkerStatus } from '@/lib/db';
import { SyncService, type SyncStatus } from '@/services/syncService';
import { useConvex } from 'convex/react';
import PageLifecycleService from '@/services/pageLifecycleService';
import { getSyncConfig } from '@/lib/config/syncConfig';

interface OfflineContextType {
  isOnline: boolean;
  serviceWorkerStatus: ServiceWorkerStatus;
  syncStatus: SyncStatus;
  triggerSync: () => Promise<void>;
  clearCaches: () => Promise<void>;
  triggerEmergencySync: () => void;
  isPageVisible: boolean;
  backgroundSyncSupported: boolean;
  registerBackgroundSync: (operation: string, recordId: string) => Promise<boolean>;
}

const OfflineContext = createContext<OfflineContextType | null>(null);

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState<ServiceWorkerStatus>('installing');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [backgroundSyncSupported, setBackgroundSyncSupported] = useState(false);
  const convex = useConvex();

  useEffect(() => {
    // Initialize online status
    setIsOnline(navigator.onLine);

    // Setup online/offline listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let timeoutId: NodeJS.Timeout | undefined;
    let handleControllerChange: (() => void) | undefined;

    // Check for service worker support and status
    if ('serviceWorker' in navigator) {
      // Initial status check with a delay to allow registration to start
      const checkServiceWorkerStatus = () => {
        navigator.serviceWorker.getRegistration()
          .then((registration: ServiceWorkerRegistration | undefined) => {
            if (registration) {
              if (registration.active) {
                setServiceWorkerStatus('active');
              } else if (registration.waiting) {
                setServiceWorkerStatus('waiting');
              } else if (registration.installing) {
                setServiceWorkerStatus('installing');
              }
            } else {
              // No registration found yet, still waiting
              setServiceWorkerStatus('installing');
            }
          })
          .catch(() => {
            setServiceWorkerStatus('error');
          });
      };

      // Check immediately
      checkServiceWorkerStatus();

      // Check again after a short delay to catch registration that starts after component mount
      timeoutId = setTimeout(checkServiceWorkerStatus, 1000);

      // Listen for service worker ready event
      navigator.serviceWorker.ready
        .then(() => {
          setServiceWorkerStatus('active');
        })
        .catch(() => {
          setServiceWorkerStatus('error');
        });

      // Listen for controller changes (when service worker activates)
      handleControllerChange = () => {
        setServiceWorkerStatus('active');
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    } else {
      setServiceWorkerStatus('not_supported');
    }

    // Initialize sync service
    SyncService.initialize(convex);

    // Setup sync status listener
    const unsubscribeSync = SyncService.addSyncListener(setSyncStatus);

    // Check background sync support
    const bgSyncSupported = SyncService.isBackgroundSyncSupported();
    setBackgroundSyncSupported(bgSyncSupported);

    // Setup background sync listener
    const unsubscribeBackgroundSync = SyncService.setupBackgroundSyncListener();

    // Initialize PageLifecycleService
    const config = getSyncConfig();
    PageLifecycleService.initialize({
      debounceMs: config.emergency.debounceMs,
      enableBeforeUnload: config.emergency.beforeUnloadSync,
      enableVisibilityChange: config.emergency.visibilityChangeSync,
      enablePageHide: true,
      logEvents: config.debugging.logLevel === 'debug',
    });

    // Setup emergency sync callback
    const unsubscribeEmergencySync = PageLifecycleService.onEmergencySync(async () => {
      await SyncService.emergencySync();
    });

    // Setup visibility change callback
    const unsubscribeVisibilityChange = PageLifecycleService.onVisibilityChange((hidden) => {
      setIsPageVisible(!hidden);
      
      // Trigger sync when page becomes visible (user returns to tab)
      // Check online status dynamically to avoid stale closure
      if (!hidden && navigator.onLine) {
        SyncService.triggerSync();
      }
    });

    // Listen for background sync messages from service worker
    const handleBackgroundSync = () => {
      SyncService.triggerSync();
    };

    window.addEventListener('sw-background-sync', handleBackgroundSync);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sw-background-sync', handleBackgroundSync);
      
      // Clean up service worker listeners and timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (handleControllerChange) {
        navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
      }
      
      // Clean up PageLifecycleService
      unsubscribeEmergencySync();
      unsubscribeVisibilityChange();
      PageLifecycleService.cleanup();
      
      // Clean up background sync listener
      unsubscribeBackgroundSync();
      
      unsubscribeSync();
      SyncService.cleanup();
    };
  }, [convex]); // Remove isOnline dependency to prevent re-initialization

  // Handle online status changes separately to prevent re-initialization
  useEffect(() => {
    if (isOnline) {
      // Trigger sync when coming back online, but debounce to prevent multiple triggers
      const timeoutId = setTimeout(() => {
        SyncService.triggerSync();
      }, 1000); // 1 second delay to debounce multiple online events
      
      return () => clearTimeout(timeoutId);
    }
  }, [isOnline]);

  const triggerSync = async () => {
    await SyncService.forceSync();
  };

  const triggerEmergencySync = () => {
    SyncService.triggerEmergencySync();
  };

  const registerBackgroundSync = async (operation: string, recordId: string): Promise<boolean> => {
    return await SyncService.registerBackgroundSync(operation, recordId);
  };

  const clearCaches = async () => {
    // Clear caches using Cache API directly since next-pwa manages the service worker
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
  };

  const value: OfflineContextType = {
    isOnline,
    serviceWorkerStatus,
    syncStatus,
    triggerSync,
    clearCaches,
    triggerEmergencySync,
    isPageVisible,
    backgroundSyncSupported,
    registerBackgroundSync,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
}