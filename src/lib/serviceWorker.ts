'use client';

export class ServiceWorkerManager {
  private static registration: ServiceWorkerRegistration | null = null;
  private static listeners: Array<(status: ServiceWorkerStatus) => void> = [];

  static readonly status = {
    unsupported: 'unsupported' as const,
    installing: 'installing' as const,
    installed: 'installed' as const,
    activating: 'activating' as const,
    activated: 'activated' as const,
    error: 'error' as const,
  };

  /**
   * Register the service worker
   */
  static async register(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('Service workers not supported');
      this.notifyListeners(this.status.unsupported);
      return null;
    }

    try {
      this.notifyListeners(this.status.installing);
      
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      this.registration = registration;
      this.setupEventListeners(registration);

      console.log('Service worker registered successfully');
      
      // Check if there's an update available
      await this.checkForUpdates();
      
      this.notifyListeners(this.status.installed);
      return registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      this.notifyListeners(this.status.error);
      return null;
    }
  }

  /**
   * Setup event listeners for the service worker
   */
  private static setupEventListeners(registration: ServiceWorkerRegistration): void {
    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New content is available, show update notification
          this.notifyUpdateAvailable();
        }
      });
    });

    // Listen for messages from the service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      this.handleServiceWorkerMessage(event.data);
    });

    // Listen for controller changes
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // The service worker has been updated
      console.log('Service worker controller changed');
      window.location.reload();
    });
  }

  /**
   * Handle messages from the service worker
   */
  private static handleServiceWorkerMessage(data: any): void {
    if (data?.type === 'BACKGROUND_SYNC') {
      // Trigger sync in the main app
      this.triggerAppSync();
    }
  }

  /**
   * Trigger sync in the main application
   */
  private static triggerAppSync(): void {
    // Dispatch a custom event that the app can listen to
    window.dispatchEvent(new CustomEvent('sw-background-sync', {
      detail: { timestamp: Date.now() }
    }));
  }

  /**
   * Check for service worker updates
   */
  static async checkForUpdates(): Promise<void> {
    if (!this.registration) return;

    try {
      await this.registration.update();
    } catch (error) {
      console.error('Failed to check for service worker updates:', error);
    }
  }

  /**
   * Notify that an update is available
   */
  private static notifyUpdateAvailable(): void {
    // Show a notification or prompt to the user
    if (confirm('A new version of CompTrails is available. Update now?')) {
      this.activateUpdate();
    }
  }

  /**
   * Activate the waiting service worker
   */
  static async activateUpdate(): Promise<void> {
    if (!this.registration?.waiting) return;

    this.notifyListeners(this.status.activating);

    // Tell the waiting service worker to skip waiting
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    
    this.notifyListeners(this.status.activated);
  }

  /**
   * Unregister the service worker
   */
  static async unregister(): Promise<boolean> {
    if (!this.registration) return false;

    try {
      const result = await this.registration.unregister();
      this.registration = null;
      console.log('Service worker unregistered');
      return result;
    } catch (error) {
      console.error('Failed to unregister service worker:', error);
      return false;
    }
  }

  /**
   * Get the current registration
   */
  static getRegistration(): ServiceWorkerRegistration | null {
    return this.registration;
  }

  /**
   * Check if service workers are supported
   */
  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator;
  }

  /**
   * Get the current service worker status
   */
  static getCurrentStatus(): ServiceWorkerStatus {
    if (!this.isSupported()) {
      return this.status.unsupported;
    }

    if (!this.registration) {
      return this.status.installing;
    }

    if (this.registration.active) {
      return this.status.activated;
    }

    if (this.registration.installing) {
      return this.status.installing;
    }

    return this.status.installed;
  }

  /**
   * Add a status listener
   */
  static addStatusListener(listener: (status: ServiceWorkerStatus) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of status change
   */
  private static notifyListeners(status: ServiceWorkerStatus): void {
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in service worker listener:', error);
      }
    });
  }

  /**
   * Request background sync (if supported)
   */
  static async requestBackgroundSync(tag: string = 'background-sync'): Promise<void> {
    if (!this.registration || !('sync' in window)) {
      console.log('Background sync not supported');
      return;
    }

    try {
      // Type assertion for background sync API
      const syncManager = (this.registration as any).sync;
      if (syncManager) {
        await syncManager.register(tag);
        console.log('Background sync registered');
      }
    } catch (error) {
      console.error('Failed to register background sync:', error);
    }
  }

  /**
   * Get cache information
   */
  static async getCacheInfo(): Promise<{ names: string[]; totalSize: number }> {
    if (!('caches' in window)) {
      return { names: [], totalSize: 0 };
    }

    try {
      const cacheNames = await caches.keys();
      let totalSize = 0;

      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        
        for (const request of keys) {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.blob();
            totalSize += blob.size;
          }
        }
      }

      return { names: cacheNames, totalSize };
    } catch (error) {
      console.error('Failed to get cache info:', error);
      return { names: [], totalSize: 0 };
    }
  }

  /**
   * Clear all caches
   */
  static async clearCaches(): Promise<void> {
    if (!('caches' in window)) return;

    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('All caches cleared');
    } catch (error) {
      console.error('Failed to clear caches:', error);
    }
  }
}

export type ServiceWorkerStatus = typeof ServiceWorkerManager.status[keyof typeof ServiceWorkerManager.status];