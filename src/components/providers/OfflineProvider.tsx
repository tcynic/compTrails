'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { type ServiceWorkerStatus } from '@/lib/db';
import { SyncService, type SyncStatus } from '@/services/syncService';

interface OfflineContextType {
  isOnline: boolean;
  serviceWorkerStatus: ServiceWorkerStatus;
  syncStatus: SyncStatus;
  triggerSync: () => Promise<void>;
  clearCaches: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | null>(null);

interface OfflineProviderProps {
  children: ReactNode;
}

export function OfflineProvider({ children }: OfflineProviderProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState<ServiceWorkerStatus>('installing');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  useEffect(() => {
    // Initialize online status
    setIsOnline(navigator.onLine);

    // Setup online/offline listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check for service worker registration (next-pwa handles this automatically)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(() => {
          setServiceWorkerStatus('active');
        })
        .catch(() => {
          setServiceWorkerStatus('error');
        });
    } else {
      setServiceWorkerStatus('not_supported');
    }

    // Initialize sync service
    SyncService.initialize();

    // Setup sync status listener
    const unsubscribeSync = SyncService.addSyncListener(setSyncStatus);

    // Listen for background sync messages from service worker
    const handleBackgroundSync = () => {
      SyncService.triggerSync();
    };

    window.addEventListener('sw-background-sync', handleBackgroundSync);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sw-background-sync', handleBackgroundSync);
      unsubscribeSync();
      SyncService.cleanup();
    };
  }, []);

  const triggerSync = async () => {
    await SyncService.forceSync();
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