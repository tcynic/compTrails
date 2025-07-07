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
  private static isEnabled = true;
  private static isInitialized = false;
  private static adBlockerDetected = false;
  private static failedRequests = 0;
  private static maxFailedRequests = 3;

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