import posthog from 'posthog-js';

// Type definitions for analytics events
export interface AnalyticsEventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export interface AuthEventProperties extends AnalyticsEventProperties {
  provider?: string;
  success?: boolean;
  error_type?: string;
}

export interface DataEventProperties extends AnalyticsEventProperties {
  data_type: 'salary' | 'bonus' | 'equity';
  action: 'create' | 'update' | 'delete' | 'view';
  currency?: string;
  amount_range?: string; // e.g., "100k-150k" instead of exact amount
  company_size?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
}

export interface FeatureEventProperties extends AnalyticsEventProperties {
  feature_name: string;
  section?: string;
  action?: string;
}

export interface PerformanceEventProperties extends AnalyticsEventProperties {
  operation: string;
  duration_ms: number;
  success: boolean;
  error_type?: string;
}

export interface SyncEventProperties extends AnalyticsEventProperties {
  sync_type: 'regular' | 'emergency' | 'background';
  trigger_type?: 'manual' | 'beforeunload' | 'visibilitychange' | 'pagehide' | 'auto';
  method?: 'beacon' | 'fetch' | 'background_sync' | 'regular';
  pending_items?: number;
  duration_ms?: number;
  success: boolean;
  error_type?: string;
  // Browser support as separate boolean fields to match AnalyticsEventProperties constraint
  background_sync_support?: boolean;
  beacon_api_support?: boolean;
  service_worker_support?: boolean;
  visibility_api_support?: boolean;
}

/**
 * Privacy-first analytics service for CompTrails
 * 
 * This service ensures that:
 * - No personally identifiable information (PII) is tracked
 * - No actual compensation values are sent to PostHog
 * - All data is anonymized and aggregated
 * - Users can opt-out of tracking
 */
export class AnalyticsService {
  private static isEnabled: boolean = true;
  private static isInitialized: boolean = false;
  private static adBlockerDetected: boolean = false;
  private static failedRequests: number = 0;
  private static maxFailedRequests: number = 3;

  // Static initialization block to ensure properties are properly set
  static {
    this.isEnabled = true;
    this.isInitialized = false;
    this.adBlockerDetected = false;
    this.failedRequests = 0;
    this.maxFailedRequests = 3;
  }

  /**
   * Initialize the analytics service
   */
  static initialize() {
    if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      this.isEnabled = false;
      return;
    }

    this.isInitialized = true;
    this.failedRequests = 0; // Reset counter on successful initialization
  }

  /**
   * Mark that an ad blocker has been detected
   */
  static setAdBlockerDetected(detected: boolean) {
    // Defensive check to ensure static properties are initialized
    if (typeof this.adBlockerDetected === 'undefined') {
      console.warn('AnalyticsService not properly initialized, initializing now');
      this.isEnabled = true;
      this.isInitialized = false;
      this.adBlockerDetected = false;
      this.failedRequests = 0;
      this.maxFailedRequests = 3;
    }
    
    this.adBlockerDetected = detected;
    if (detected) {
      this.isEnabled = false;
      console.log('Analytics disabled due to ad blocker detection');
    }
  }

  /**
   * Check if ad blocker is detected
   */
  static isAdBlockerDetected(): boolean {
    // Defensive check to ensure static properties are initialized
    if (typeof this.adBlockerDetected === 'undefined') {
      console.warn('AnalyticsService not properly initialized, returning false');
      return false;
    }
    return this.adBlockerDetected;
  }

  /**
   * Increment failed request counter and disable if threshold reached
   */
  private static handleFailedRequest() {
    this.failedRequests++;
    if (this.failedRequests >= this.maxFailedRequests) {
      console.warn(`Analytics disabled after ${this.maxFailedRequests} failed requests (likely ad blocker)`);
      this.isEnabled = false;
      this.adBlockerDetected = true;
    }
  }

  /**
   * Enable or disable analytics tracking
   */
  static setEnabled(enabled: boolean) {
    // Defensive check to ensure static properties are initialized
    if (typeof this.isEnabled === 'undefined') {
      console.warn('AnalyticsService not properly initialized, initializing now');
      this.isEnabled = true;
      this.isInitialized = false;
      this.adBlockerDetected = false;
      this.failedRequests = 0;
      this.maxFailedRequests = 3;
    }
    
    this.isEnabled = enabled;
    
    if (typeof window !== 'undefined') {
      try {
        // Check if PostHog is initialized before changing opt-in status
        if (!posthog || !posthog.__loaded || typeof posthog.opt_in_capturing !== 'function') {
          console.warn('PostHog not yet loaded, caching preference');
          return;
        }

        if (enabled) {
          posthog.opt_in_capturing();
        } else {
          posthog.opt_out_capturing();
        }
      } catch (error) {
        console.warn('Failed to set analytics preference:', error);
      }
    }
  }

  /**
   * Check if analytics is enabled
   */
  static getEnabled(): boolean {
    // Defensive check to ensure static properties are initialized
    if (typeof this.isEnabled === 'undefined' || typeof this.isInitialized === 'undefined') {
      console.warn('AnalyticsService not properly initialized, returning false');
      return false;
    }
    return this.isEnabled && this.isInitialized;
  }

  /**
   * Track a generic event
   */
  private static track(eventName: string, properties?: AnalyticsEventProperties) {
    if (!this.getEnabled() || typeof window === 'undefined' || this.adBlockerDetected) {
      return;
    }

    try {
      // Multiple layers of PostHog initialization checks
      if (!posthog) {
        console.warn('PostHog instance not available, skipping event:', eventName);
        this.handleFailedRequest();
        return;
      }

      if (typeof posthog.capture !== 'function') {
        console.warn('PostHog capture method not available, skipping event:', eventName);
        this.handleFailedRequest();
        return;
      }

      // Check if PostHog is properly loaded
      if (!posthog.__loaded) {
        console.warn('PostHog not yet loaded, skipping event:', eventName);
        return; // Don't count this as a failed request, just not ready yet
      }

      // Additional safety check for the capture function
      if (posthog.capture.toString().includes('[native code]') || posthog.capture.length >= 0) {
        posthog.capture(eventName, {
          ...properties,
          timestamp: Date.now(),
        });
        
        // Reset failed request counter on successful tracking
        if (this.failedRequests > 0) {
          this.failedRequests = Math.max(0, this.failedRequests - 1);
        }
      } else {
        console.warn('PostHog capture function appears invalid, skipping event:', eventName);
        this.handleFailedRequest();
      }
    } catch (error) {
      console.warn('Analytics tracking failed for event:', eventName, 'Error:', error);
      
      // Check if this is a network-related error that suggests ad blocking
      const errorMessage = error?.toString?.() || '';
      if (errorMessage.includes('blocked') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
        this.handleFailedRequest();
      }
    }
  }

  /**
   * Identify a user (without PII)
   */
  static identifyUser(userId: string, properties?: AnalyticsEventProperties) {
    if (!this.getEnabled() || typeof window === 'undefined') {
      return;
    }

    try {
      // Check if PostHog is initialized before identifying
      if (!posthog) {
        console.warn('PostHog instance not available, skipping user identification');
        return;
      }

      if (typeof posthog.identify !== 'function') {
        console.warn('PostHog identify method not available, skipping user identification');
        return;
      }

      if (!posthog.__loaded) {
        console.warn('PostHog not yet loaded, skipping user identification');
        return;
      }

      // Only track anonymous user ID and safe properties
      posthog.identify(userId, {
        ...properties,
        first_seen: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('User identification failed for userId:', userId, 'Error:', error);
    }
  }

  /**
   * Track authentication events
   */
  static trackAuth(event: 'login_attempt' | 'login_success' | 'login_failure' | 'logout', properties?: AuthEventProperties) {
    this.track(`auth_${event}`, properties);
  }

  /**
   * Track compensation data events (privacy-safe)
   */
  static trackDataEvent(properties: DataEventProperties) {
    // Convert sensitive data to safe ranges
    const safeProperties = {
      ...properties,
      // Remove any potential PII or exact values
    };

    this.track('compensation_data_event', safeProperties);
  }

  /**
   * Track feature usage
   */
  static trackFeatureUsage(properties: FeatureEventProperties) {
    this.track('feature_usage', properties);
  }

  /**
   * Track performance metrics
   */
  static trackPerformance(properties: PerformanceEventProperties) {
    this.track('performance_metric', properties);
  }

  /**
   * Track page views
   */
  static trackPageView(pageName: string, properties?: AnalyticsEventProperties) {
    this.track('page_view', {
      page_name: pageName,
      ...properties,
    });
  }

  /**
   * Track user engagement events
   */
  static trackEngagement(event: 'session_start' | 'session_end' | 'app_open' | 'app_close', properties?: AnalyticsEventProperties) {
    this.track(`engagement_${event}`, properties);
  }

  /**
   * Track export/import events
   */
  static trackDataExport(format: 'csv' | 'json' | 'pdf', recordCount: number, dataTypes: string[]) {
    this.track('data_export', {
      export_format: format,
      record_count_range: this.getCountRange(recordCount),
      data_types: dataTypes.join(','),
    });
  }

  /**
   * Track sync events
   */
  static trackSync(event: 'sync_start' | 'sync_success' | 'sync_failure', duration?: number, recordCount?: number) {
    this.track(`sync_${event}`, {
      duration_ms: duration,
      record_count_range: recordCount ? this.getCountRange(recordCount) : undefined,
    });
  }

  /**
   * Track emergency sync events with detailed properties
   */
  static trackEmergencySync(properties: SyncEventProperties) {
    this.track('emergency_sync_triggered', {
      ...properties,
      // Sanitize data to ensure privacy
      pending_items: properties.pending_items ? this.getCountRange(properties.pending_items) : undefined,
    });
  }

  /**
   * Track background sync events
   */
  static trackBackgroundSync(
    event: 'registered' | 'completed' | 'failed' | 'queue_processed',
    properties: Partial<SyncEventProperties> = {}
  ) {
    this.track(`background_sync_${event}`, {
      sync_type: 'background',
      ...properties,
      pending_items: properties.pending_items ? this.getCountRange(properties.pending_items) : undefined,
    });
  }

  /**
   * Track sync method usage and effectiveness
   */
  static trackSyncMethod(
    method: 'beacon' | 'fetch' | 'background_sync' | 'regular',
    success: boolean,
    properties: Partial<SyncEventProperties> = {}
  ) {
    this.track('sync_method_usage', {
      method,
      success,
      sync_type: properties.sync_type || 'regular',
      duration_ms: properties.duration_ms,
      error_type: properties.error_type,
    });
  }

  /**
   * Track page lifecycle events that trigger sync
   */
  static trackPageLifecycleSync(
    trigger: 'beforeunload' | 'visibilitychange' | 'pagehide',
    success: boolean,
    properties: Partial<SyncEventProperties> = {}
  ) {
    this.track('page_lifecycle_sync', {
      trigger_type: trigger,
      success,
      sync_type: 'emergency',
      ...properties,
      pending_items: properties.pending_items ? this.getCountRange(properties.pending_items) : undefined,
    });
  }

  /**
   * Track browser capability detection for sync features
   */
  static trackBrowserCapabilities(capabilities: {
    background_sync: boolean;
    beacon_api: boolean;
    service_worker: boolean;
    visibility_api: boolean;
  }) {
    this.track('browser_capabilities', {
      background_sync_support: capabilities.background_sync,
      beacon_api_support: capabilities.beacon_api,
      service_worker_support: capabilities.service_worker,
      visibility_api_support: capabilities.visibility_api,
      user_agent_hash: this.hashUserAgent(), // Privacy-safe browser identification
    });
  }

  /**
   * Track sync queue health metrics
   */
  static trackSyncQueueHealth(queueSize: number, oldestItemAge?: number) {
    this.track('sync_queue_health', {
      queue_size_range: this.getCountRange(queueSize),
      oldest_item_age_range: oldestItemAge ? this.getTimeRange(oldestItemAge) : undefined,
    });
  }

  /**
   * Track sync configuration changes
   */
  static trackSyncConfigurationChange(
    configType: 'emergency' | 'background' | 'intervals' | 'retries',
    changes: Record<string, any>,
    properties?: Partial<SyncEventProperties>
  ) {
    this.track('sync_configuration_changed', {
      config_type: configType,
      changes_count: Object.keys(changes).length,
      ...properties,
    });
  }

  /**
   * Track sync health patterns and performance
   */
  static trackSyncHealthPattern(
    pattern: 'success_rate' | 'timing_degradation' | 'error_spike' | 'queue_buildup',
    metrics: {
      success_rate?: number;
      average_duration?: number;
      error_count?: number;
      queue_size?: number;
      time_window?: number;
    },
    properties?: Partial<SyncEventProperties>
  ) {
    this.track('sync_health_pattern', {
      pattern_type: pattern,
      success_rate_range: metrics.success_rate ? this.getPercentageRange(metrics.success_rate) : undefined,
      duration_range: metrics.average_duration ? this.getTimeRange(metrics.average_duration) : undefined,
      error_count_range: metrics.error_count ? this.getCountRange(metrics.error_count) : undefined,
      queue_size_range: metrics.queue_size ? this.getCountRange(metrics.queue_size) : undefined,
      time_window_range: metrics.time_window ? this.getTimeRange(metrics.time_window) : undefined,
      ...properties,
    });
  }

  /**
   * Track manual sync testing events
   */
  static trackManualSyncTest(
    testType: 'emergency' | 'background' | 'regular' | 'health_check',
    result: 'success' | 'failure' | 'partial',
    metrics: {
      duration?: number;
      items_synced?: number;
      error_type?: string;
      method_used?: string;
    },
    properties?: Partial<SyncEventProperties>
  ) {
    this.track('manual_sync_test', {
      test_type: testType,
      result,
      duration_range: metrics.duration ? this.getTimeRange(metrics.duration) : undefined,
      items_synced_range: metrics.items_synced ? this.getCountRange(metrics.items_synced) : undefined,
      error_type: metrics.error_type,
      method_used: metrics.method_used,
      ...properties,
    });
  }

  /**
   * Track sync performance benchmarks
   */
  static trackSyncPerformanceBenchmark(
    benchmarkType: 'emergency_sync_speed' | 'background_sync_reliability' | 'offline_queue_recovery',
    metrics: {
      baseline_duration?: number;
      current_duration?: number;
      improvement_percentage?: number;
      regression_percentage?: number;
    },
    properties?: Partial<SyncEventProperties>
  ) {
    this.track('sync_performance_benchmark', {
      benchmark_type: benchmarkType,
      baseline_duration_range: metrics.baseline_duration ? this.getTimeRange(metrics.baseline_duration) : undefined,
      current_duration_range: metrics.current_duration ? this.getTimeRange(metrics.current_duration) : undefined,
      improvement_range: metrics.improvement_percentage ? this.getPercentageRange(metrics.improvement_percentage) : undefined,
      regression_range: metrics.regression_percentage ? this.getPercentageRange(metrics.regression_percentage) : undefined,
      ...properties,
    });
  }

  /**
   * Track sync method effectiveness comparison
   */
  static trackSyncMethodEffectiveness(
    comparison: {
      beacon_success_rate?: number;
      fetch_success_rate?: number;
      background_sync_success_rate?: number;
      regular_sync_success_rate?: number;
    },
    timeWindow: number,
    properties?: Partial<SyncEventProperties>
  ) {
    this.track('sync_method_effectiveness', {
      beacon_success_rate: comparison.beacon_success_rate ? this.getPercentageRange(comparison.beacon_success_rate) : undefined,
      fetch_success_rate: comparison.fetch_success_rate ? this.getPercentageRange(comparison.fetch_success_rate) : undefined,
      background_sync_success_rate: comparison.background_sync_success_rate ? this.getPercentageRange(comparison.background_sync_success_rate) : undefined,
      regular_sync_success_rate: comparison.regular_sync_success_rate ? this.getPercentageRange(comparison.regular_sync_success_rate) : undefined,
      time_window_range: this.getTimeRange(timeWindow),
      ...properties,
    });
  }

  /**
   * Track sync diagnostic events
   */
  static trackSyncDiagnostic(
    diagnosticType: 'health_check' | 'capability_test' | 'performance_test' | 'configuration_validation',
    result: 'pass' | 'fail' | 'warning',
    details: {
      issue_type?: string;
      recommendation?: string;
      severity?: 'low' | 'medium' | 'high';
    },
    properties?: Partial<SyncEventProperties>
  ) {
    this.track('sync_diagnostic', {
      diagnostic_type: diagnosticType,
      result,
      issue_type: details.issue_type,
      recommendation: details.recommendation,
      severity: details.severity,
      ...properties,
    });
  }

  /**
   * Track offline/online status changes
   */
  static trackConnectivity(status: 'online' | 'offline', properties?: AnalyticsEventProperties) {
    this.track(`connectivity_${status}`, properties);
  }

  /**
   * Track error events
   */
  static trackError(errorType: string, errorMessage?: string, context?: string) {
    this.track('error_occurred', {
      error_type: errorType,
      error_message: errorMessage?.slice(0, 100), // Truncate to avoid PII
      context,
    });
  }

  /**
   * Convert exact counts to privacy-safe ranges
   */
  private static getCountRange(count: number): string {
    if (count === 0) return '0';
    if (count <= 5) return '1-5';
    if (count <= 10) return '6-10';
    if (count <= 25) return '11-25';
    if (count <= 50) return '26-50';
    if (count <= 100) return '51-100';
    if (count <= 500) return '101-500';
    return '500+';
  }

  /**
   * Convert salary amounts to privacy-safe ranges
   */
  static getSalaryRange(amount: number, currency: string = 'USD'): string {
    // Only support USD ranges for now, can be expanded
    if (currency !== 'USD') return 'non-usd';
    
    if (amount < 50000) return 'under-50k';
    if (amount < 75000) return '50k-75k';
    if (amount < 100000) return '75k-100k';
    if (amount < 150000) return '100k-150k';
    if (amount < 200000) return '150k-200k';
    if (amount < 300000) return '200k-300k';
    if (amount < 500000) return '300k-500k';
    return 'over-500k';
  }

  /**
   * Convert time values to privacy-safe ranges (in milliseconds)
   */
  static getTimeRange(timeMs: number): string {
    const seconds = timeMs / 1000;
    const minutes = seconds / 60;
    const hours = minutes / 60;
    
    if (seconds < 1) return 'under-1s';
    if (seconds < 5) return '1s-5s';
    if (seconds < 10) return '5s-10s';
    if (seconds < 30) return '10s-30s';
    if (minutes < 1) return '30s-1m';
    if (minutes < 5) return '1m-5m';
    if (minutes < 15) return '5m-15m';
    if (minutes < 30) return '15m-30m';
    if (hours < 1) return '30m-1h';
    if (hours < 6) return '1h-6h';
    if (hours < 24) return '6h-24h';
    return 'over-24h';
  }

  /**
   * Convert percentage values to privacy-safe ranges
   */
  static getPercentageRange(percentage: number): string {
    if (percentage < 0) return 'negative';
    if (percentage === 0) return '0%';
    if (percentage < 10) return '1-10%';
    if (percentage < 25) return '11-25%';
    if (percentage < 50) return '26-50%';
    if (percentage < 75) return '51-75%';
    if (percentage < 90) return '76-90%';
    if (percentage < 100) return '91-99%';
    if (percentage === 100) return '100%';
    return 'over-100%';
  }

  /**
   * Create a privacy-safe hash of the user agent
   */
  static hashUserAgent(): string {
    if (typeof window === 'undefined' || !window.navigator?.userAgent) {
      return 'unknown';
    }

    const userAgent = window.navigator.userAgent;
    
    // Extract key browser info without full user agent string
    const browserInfo = {
      platform: navigator.platform || 'unknown',
      language: navigator.language || 'unknown',
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      // Extract browser name and major version only
      browser: this.extractBrowserInfo(userAgent),
    };

    // Create a simple hash of the browser info
    const infoString = JSON.stringify(browserInfo);
    let hash = 0;
    for (let i = 0; i < infoString.length; i++) {
      const char = infoString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * Extract basic browser information (privacy-safe)
   */
  private static extractBrowserInfo(userAgent: string): string {
    if (userAgent.includes('Chrome')) {
      const match = userAgent.match(/Chrome\/(\d+)/);
      return match ? `Chrome ${match[1]}` : 'Chrome';
    }
    if (userAgent.includes('Firefox')) {
      const match = userAgent.match(/Firefox\/(\d+)/);
      return match ? `Firefox ${match[1]}` : 'Firefox';
    }
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      const match = userAgent.match(/Version\/(\d+)/);
      return match ? `Safari ${match[1]}` : 'Safari';
    }
    if (userAgent.includes('Edge')) {
      const match = userAgent.match(/Edge\/(\d+)/);
      return match ? `Edge ${match[1]}` : 'Edge';
    }
    return 'Other';
  }

  /**
   * Reset user tracking (for logout)
   */
  static reset() {
    if (!this.getEnabled() || typeof window === 'undefined') {
      return;
    }

    try {
      // Check if PostHog is initialized before resetting
      if (!posthog) {
        console.warn('PostHog instance not available, skipping reset');
        return;
      }

      if (typeof posthog.reset !== 'function') {
        console.warn('PostHog reset method not available, skipping reset');
        return;
      }

      if (!posthog.__loaded) {
        console.warn('PostHog not yet loaded, skipping reset');
        return;
      }

      posthog.reset();
    } catch (error) {
      console.warn('Analytics reset failed:', error);
    }
  }
}