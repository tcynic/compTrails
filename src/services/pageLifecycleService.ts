/**
 * Page Lifecycle Service
 * 
 * Centralized management of page lifecycle events for emergency sync operations.
 * Handles beforeunload, visibilitychange, and pagehide events to prevent data loss
 * when users close tabs before the regular sync interval completes.
 */

type EmergencySyncCallback = () => void | Promise<void>;
type VisibilityChangeCallback = (hidden: boolean) => void;
type PageLifecycleCallback = () => void;

interface PageLifecycleConfig {
  debounceMs?: number;
  enableBeforeUnload?: boolean;
  enableVisibilityChange?: boolean;
  enablePageHide?: boolean;
  logEvents?: boolean;
}

class PageLifecycleService {
  private static instance: PageLifecycleService | null = null;
  private static isInitialized = false;
  
  private emergencySyncCallbacks: Set<EmergencySyncCallback> = new Set();
  private visibilityChangeCallbacks: Set<VisibilityChangeCallback> = new Set();
  private pageHideCallbacks: Set<PageLifecycleCallback> = new Set();
  
  private config: Required<PageLifecycleConfig>;
  private isProcessing = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isVisible = true;
  
  private constructor(config: PageLifecycleConfig = {}) {
    this.config = {
      debounceMs: 1000,
      enableBeforeUnload: true,
      enableVisibilityChange: true,
      enablePageHide: true,
      logEvents: process.env.NODE_ENV === 'development',
      ...config
    };
    
    this.isVisible = !document.hidden;
    this.bindEventHandlers();
  }
  
  /**
   * Initialize the PageLifecycleService singleton
   */
  static initialize(config?: PageLifecycleConfig): void {
    if (typeof window === 'undefined') {
      console.warn('PageLifecycleService: Cannot initialize in server environment');
      return;
    }
    
    if (PageLifecycleService.isInitialized) {
      console.warn('PageLifecycleService: Already initialized');
      return;
    }
    
    PageLifecycleService.instance = new PageLifecycleService(config);
    PageLifecycleService.isInitialized = true;
    
    if (config?.logEvents) {
      console.log('PageLifecycleService: Initialized with config:', config);
    }
  }
  
  /**
   * Get the singleton instance
   */
  private static getInstance(): PageLifecycleService {
    if (!PageLifecycleService.instance) {
      throw new Error('PageLifecycleService: Must call initialize() first');
    }
    return PageLifecycleService.instance;
  }
  
  /**
   * Register a callback for emergency sync operations
   * These callbacks are triggered during page unload events
   */
  static onEmergencySync(callback: EmergencySyncCallback): () => void {
    const instance = PageLifecycleService.getInstance();
    instance.emergencySyncCallbacks.add(callback);
    
    return () => {
      instance.emergencySyncCallbacks.delete(callback);
    };
  }
  
  /**
   * Register a callback for visibility changes
   * Triggered when page becomes hidden or visible
   */
  static onVisibilityChange(callback: VisibilityChangeCallback): () => void {
    const instance = PageLifecycleService.getInstance();
    instance.visibilityChangeCallbacks.add(callback);
    
    return () => {
      instance.visibilityChangeCallbacks.delete(callback);
    };
  }
  
  /**
   * Register a callback for page hide events
   * Triggered when page is about to be hidden or closed
   */
  static onPageHide(callback: PageLifecycleCallback): () => void {
    const instance = PageLifecycleService.getInstance();
    instance.pageHideCallbacks.add(callback);
    
    return () => {
      instance.pageHideCallbacks.delete(callback);
    };
  }
  
  /**
   * Get current page visibility state
   */
  static isPageVisible(): boolean {
    if (!PageLifecycleService.isInitialized) {
      return true;
    }
    return PageLifecycleService.getInstance().isVisible;
  }
  
  /**
   * Manually trigger emergency sync
   */
  static triggerEmergencySync(): void {
    if (!PageLifecycleService.isInitialized) {
      console.warn('PageLifecycleService: Not initialized, cannot trigger emergency sync');
      return;
    }
    
    const instance = PageLifecycleService.getInstance();
    instance.executeEmergencySync('manual');
  }
  
  /**
   * Cleanup all event listeners and callbacks
   */
  static cleanup(): void {
    if (!PageLifecycleService.instance) {
      return;
    }
    
    const instance = PageLifecycleService.instance;
    instance.unbindEventHandlers();
    instance.emergencySyncCallbacks.clear();
    instance.visibilityChangeCallbacks.clear();
    instance.pageHideCallbacks.clear();
    
    if (instance.debounceTimer) {
      clearTimeout(instance.debounceTimer);
      instance.debounceTimer = null;
    }
    
    PageLifecycleService.instance = null;
    PageLifecycleService.isInitialized = false;
  }
  
  /**
   * Bind event handlers to DOM events
   */
  private bindEventHandlers(): void {
    if (this.config.enableBeforeUnload) {
      window.addEventListener('beforeunload', this.handleBeforeUnload, { passive: false });
    }
    
    if (this.config.enableVisibilityChange) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange, { passive: true });
    }
    
    if (this.config.enablePageHide) {
      window.addEventListener('pagehide', this.handlePageHide, { passive: true });
    }
  }
  
  /**
   * Remove event handlers from DOM events
   */
  private unbindEventHandlers(): void {
    if (this.config.enableBeforeUnload) {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
    }
    
    if (this.config.enableVisibilityChange) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    
    if (this.config.enablePageHide) {
      window.removeEventListener('pagehide', this.handlePageHide);
    }
  }
  
  /**
   * Handle beforeunload events
   */
  private handleBeforeUnload = (): void => {
    this.log('beforeunload event triggered');
    
    // Execute emergency sync immediately for beforeunload
    this.executeEmergencySync('beforeunload');
    
    // Note: We don't prevent default or show confirmation dialog
    // as this would interfere with user experience
  };
  
  /**
   * Handle visibility change events
   */
  private handleVisibilityChange = (): void => {
    const wasVisible = this.isVisible;
    this.isVisible = !document.hidden;
    
    this.log(`visibilitychange: ${wasVisible ? 'visible' : 'hidden'} → ${this.isVisible ? 'visible' : 'hidden'}`);
    
    // Notify visibility change callbacks
    this.visibilityChangeCallbacks.forEach(callback => {
      try {
        callback(document.hidden);
      } catch (error) {
        console.error('PageLifecycleService: Error in visibility change callback:', error);
      }
    });
    
    // Trigger emergency sync when page becomes hidden
    if (wasVisible && !this.isVisible) {
      this.debouncedEmergencySync('visibilitychange');
    }
  };
  
  /**
   * Handle page hide events
   */
  private handlePageHide = (): void => {
    this.log('pagehide event triggered');
    
    // Notify page hide callbacks
    this.pageHideCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('PageLifecycleService: Error in page hide callback:', error);
      }
    });
    
    // Trigger emergency sync immediately for page hide
    this.executeEmergencySync('pagehide');
  };
  
  /**
   * Execute emergency sync with intelligent debouncing
   */
  private debouncedEmergencySync(trigger: string): void {
    // Clear existing timer if any
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    // Different debounce strategies based on trigger type
    let debounceTime = this.config.debounceMs;
    
    switch (trigger) {
      case 'visibilitychange':
        // Shorter debounce for visibility changes to catch quick tab switches
        debounceTime = Math.min(this.config.debounceMs, 500);
        break;
      case 'beforeunload':
      case 'pagehide':
        // No debounce for critical events - execute immediately
        debounceTime = 0;
        break;
      default:
        // Use configured debounce time
        break;
    }
    
    if (debounceTime === 0) {
      // Execute immediately for critical events
      this.executeEmergencySync(trigger);
    } else {
      // Use debounced execution for other events
      this.debounceTimer = setTimeout(() => {
        this.executeEmergencySync(trigger);
        this.debounceTimer = null;
      }, debounceTime);
    }
  }
  
  /**
   * Execute emergency sync callbacks with enhanced error handling
   */
  private executeEmergencySync(trigger: string): void {
    if (this.isProcessing) {
      this.log(`Emergency sync already in progress, skipping ${trigger}`);
      return;
    }
    
    if (this.emergencySyncCallbacks.size === 0) {
      this.log(`No emergency sync callbacks registered for ${trigger}`);
      return;
    }
    
    const startTime = Date.now();
    this.log(`Executing emergency sync for ${trigger}`);
    this.isProcessing = true;
    
    const promises: Promise<void>[] = [];
    let syncSuccess = true;
    
    this.emergencySyncCallbacks.forEach(callback => {
      try {
        const result = callback();
        if (result && typeof result.then === 'function') {
          promises.push(
            result.catch(error => {
              console.error('PageLifecycleService: Error in emergency sync callback:', error);
              syncSuccess = false;
              return Promise.resolve(); // Don't let one failure stop others
            })
          );
        }
      } catch (error) {
        console.error('PageLifecycleService: Error in emergency sync callback:', error);
        syncSuccess = false;
      }
    });
    
    // Wait for all async callbacks to complete (with timeout)
    if (promises.length > 0) {
      Promise.race([
        Promise.all(promises),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
      ]).finally(() => {
        const duration = Date.now() - startTime;
        this.isProcessing = false;
        this.log(`Emergency sync completed for ${trigger} in ${duration}ms`);
        
        // Track emergency sync analytics if available
        this.trackEmergencySync(trigger, syncSuccess, duration);
      });
    } else {
      const duration = Date.now() - startTime;
      this.isProcessing = false;
      this.log(`Emergency sync completed for ${trigger} in ${duration}ms`);
      
      // Track emergency sync analytics if available
      this.trackEmergencySync(trigger, syncSuccess, duration);
    }
  }
  
  /**
   * Track emergency sync events for analytics
   */
  private trackEmergencySync(trigger: string, success: boolean, duration: number): void {
    if (typeof window === 'undefined') return;
    
    // Dynamically import analytics to avoid circular dependencies
    import('./analyticsService').then(({ AnalyticsService }) => {
      AnalyticsService.trackPageLifecycleSync(
        trigger as 'beforeunload' | 'visibilitychange' | 'pagehide',
        success,
        {
          duration_ms: duration,
          sync_type: 'emergency',
          trigger_type: 'auto',
        }
      );
    }).catch(error => {
      // Ignore analytics errors during emergency sync
      console.warn('Failed to track emergency sync analytics:', error);
    });
  }
  
  /**
   * Log events if logging is enabled
   */
  private log(message: string, data?: any): void {
    if (this.config.logEvents) {
      console.log(`PageLifecycleService: ${message}`, data || '');
    }
  }
}

export default PageLifecycleService;