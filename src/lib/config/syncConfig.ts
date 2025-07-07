/**
 * Sync Configuration
 * 
 * Centralized configuration for all sync operations including emergency sync,
 * background sync, and performance tuning parameters.
 */

export interface SyncIntervals {
  /** Regular periodic sync interval (5 minutes) */
  periodic: number;
  /** Emergency sync delay (1 second) */
  emergency: number;
  /** Health check interval (5 minutes) */
  healthCheck: number;
}

export interface SyncRetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  /** Maximum backoff delay in milliseconds */
  maxBackoffMs: number;
  /** Jitter factor for retry delays (0-1) */
  jitterFactor: number;
  /** Base retry delay in milliseconds */
  baseDelayMs: number;
}

export interface EmergencySyncConfig {
  /** Enable emergency sync functionality */
  enabled: boolean;
  /** Use Beacon API for emergency sync */
  beaconFallback: boolean;
  /** Trigger emergency sync on visibility change */
  visibilityChangeSync: boolean;
  /** Trigger emergency sync on beforeunload */
  beforeUnloadSync: boolean;
  /** Maximum time to wait for emergency sync (ms) */
  maxWaitTimeMs: number;
  /** Debounce time for emergency sync triggers (ms) */
  debounceMs: number;
}

export interface SyncDebugging {
  /** Log level for sync operations */
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'none';
  /** Track sync analytics */
  trackAnalytics: boolean;
  /** Enable performance monitoring */
  performanceMonitoring: boolean;
  /** Log sync payload sizes */
  logPayloadSizes: boolean;
}

export interface SyncConfig {
  intervals: SyncIntervals;
  retries: SyncRetryConfig;
  emergency: EmergencySyncConfig;
  debugging: SyncDebugging;
}

/**
 * Default sync configuration
 */
export const defaultSyncConfig: SyncConfig = {
  intervals: {
    periodic: 5 * 60 * 1000, // 5 minutes
    emergency: 1000, // 1 second
    healthCheck: 5 * 60 * 1000, // 5 minutes
  },
  retries: {
    maxAttempts: 3,
    backoffMultiplier: 2,
    maxBackoffMs: 30000, // 30 seconds
    jitterFactor: 0.1,
    baseDelayMs: 1000, // 1 second
  },
  emergency: {
    enabled: true,
    beaconFallback: true,
    visibilityChangeSync: true,
    beforeUnloadSync: true,
    maxWaitTimeMs: 5000, // 5 seconds
    debounceMs: 1000, // 1 second
  },
  debugging: {
    logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
    trackAnalytics: true,
    performanceMonitoring: true,
    logPayloadSizes: process.env.NODE_ENV === 'development',
  },
};

/**
 * Runtime sync configuration (can be modified at runtime)
 */
let runtimeSyncConfig: SyncConfig = { ...defaultSyncConfig };

/**
 * Get current sync configuration
 */
export function getSyncConfig(): SyncConfig {
  return runtimeSyncConfig;
}

/**
 * Update sync configuration
 */
export function updateSyncConfig(updates: Partial<SyncConfig>): void {
  runtimeSyncConfig = {
    ...runtimeSyncConfig,
    ...updates,
    intervals: { ...runtimeSyncConfig.intervals, ...updates.intervals },
    retries: { ...runtimeSyncConfig.retries, ...updates.retries },
    emergency: { ...runtimeSyncConfig.emergency, ...updates.emergency },
    debugging: { ...runtimeSyncConfig.debugging, ...updates.debugging },
  };
}

/**
 * Reset sync configuration to defaults
 */
export function resetSyncConfig(): void {
  runtimeSyncConfig = { ...defaultSyncConfig };
}

/**
 * Browser capability detection
 */
export interface BrowserCapabilities {
  /** Browser supports Background Sync API */
  supportsBackgroundSync: boolean;
  /** Browser supports Beacon API */
  supportsBeacon: boolean;
  /** Browser supports Service Workers */
  supportsServiceWorker: boolean;
  /** Browser supports Page Visibility API */
  supportsVisibilityAPI: boolean;
  /** Browser supports fetch with keepalive */
  supportsFetchKeepalive: boolean;
}

/**
 * Detect browser capabilities for sync features
 */
export function detectBrowserCapabilities(): BrowserCapabilities {
  if (typeof window === 'undefined') {
    return {
      supportsBackgroundSync: false,
      supportsBeacon: false,
      supportsServiceWorker: false,
      supportsVisibilityAPI: false,
      supportsFetchKeepalive: false,
    };
  }

  return {
    supportsBackgroundSync: 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype,
    supportsBeacon: 'sendBeacon' in navigator,
    supportsServiceWorker: 'serviceWorker' in navigator,
    supportsVisibilityAPI: 'visibilityState' in document,
    supportsFetchKeepalive: 'fetch' in window,
  };
}

/**
 * Get optimized sync configuration based on browser capabilities
 */
export function getOptimizedSyncConfig(): SyncConfig {
  const capabilities = detectBrowserCapabilities();
  const config = getSyncConfig();

  // Adjust emergency sync settings based on capabilities
  const optimizedConfig: SyncConfig = {
    ...config,
    emergency: {
      ...config.emergency,
      beaconFallback: config.emergency.beaconFallback && capabilities.supportsBeacon,
      visibilityChangeSync: config.emergency.visibilityChangeSync && capabilities.supportsVisibilityAPI,
    },
  };

  return optimizedConfig;
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
export function calculateRetryDelay(attempt: number, config: SyncRetryConfig): number {
  const baseDelay = config.baseDelayMs || 1000;
  const exponentialDelay = baseDelay * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxBackoffMs);
  
  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * config.jitterFactor * Math.random();
  
  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if sync operation should be retried
 */
export function shouldRetrySync(attempt: number, error: Error, config: SyncRetryConfig): boolean {
  if (attempt >= config.maxAttempts) {
    return false;
  }

  // Don't retry certain error types
  const nonRetryableErrors = [
    'Authentication failed',
    'Invalid data format',
    'Permission denied',
  ];

  return !nonRetryableErrors.some(errorMessage => 
    error.message.includes(errorMessage)
  );
}

/**
 * Log sync events based on configuration
 */
export function logSyncEvent(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: any
): void {
  const config = getSyncConfig();
  const logLevels = ['debug', 'info', 'warn', 'error', 'none'];
  const currentLevelIndex = logLevels.indexOf(config.debugging.logLevel);
  const messageLevelIndex = logLevels.indexOf(level);

  if (currentLevelIndex <= messageLevelIndex && currentLevelIndex !== 4) {
    const logFunction = console[level] || console.log;
    logFunction(`[SyncService] ${message}`, data || '');
  }
}

const syncConfigUtils = {
  getSyncConfig,
  updateSyncConfig,
  resetSyncConfig,
  detectBrowserCapabilities,
  getOptimizedSyncConfig,
  calculateRetryDelay,
  shouldRetrySync,
  logSyncEvent,
};

export default syncConfigUtils;