'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ServiceWorkerManager, type ServiceWorkerStatus } from '@/lib/serviceWorker';
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

    // Register service worker
    ServiceWorkerManager.register();

    // Initialize sync service
    SyncService.initialize();

    // Setup service worker status listener
    const unsubscribeServiceWorker = ServiceWorkerManager.addStatusListener(setServiceWorkerStatus);

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
      unsubscribeServiceWorker();
      unsubscribeSync();
      SyncService.cleanup();
    };
  }, []);

  const triggerSync = async () => {
    await SyncService.forceSync();
  };

  const clearCaches = async () => {
    await ServiceWorkerManager.clearCaches();
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