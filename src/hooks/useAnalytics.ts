'use client';

import { usePostHog } from 'posthog-js/react';
import { AnalyticsService } from '@/services/analyticsService';
import type { 
  AuthEventProperties, 
  DataEventProperties, 
  FeatureEventProperties, 
  PerformanceEventProperties, 
  AnalyticsEventProperties 
} from '@/services/analyticsService';

/**
 * Custom hook that combines PostHog React hooks with our privacy-first analytics service
 * Wraps analytics methods to ensure PostHog is initialized before calling them
 */
export function useAnalytics() {
  const posthog = usePostHog();

  // Helper function to check if PostHog is ready
  const isPostHogReady = () => {
    return posthog && typeof posthog.capture === 'function';
  };

  // Wrapper functions that check PostHog initialization before calling analytics methods
  const safeTrackAuth = (event: 'login_attempt' | 'login_success' | 'login_failure' | 'logout', properties?: AuthEventProperties) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping auth tracking:', event);
      return;
    }
    AnalyticsService.trackAuth(event, properties);
  };

  const safeTrackDataEvent = (properties: DataEventProperties) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping data event tracking');
      return;
    }
    AnalyticsService.trackDataEvent(properties);
  };

  const safeTrackFeatureUsage = (properties: FeatureEventProperties) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping feature usage tracking');
      return;
    }
    AnalyticsService.trackFeatureUsage(properties);
  };

  const safeTrackPerformance = (properties: PerformanceEventProperties) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping performance tracking');
      return;
    }
    AnalyticsService.trackPerformance(properties);
  };

  const safeTrackPageView = (pageName: string, properties?: AnalyticsEventProperties) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping page view tracking:', pageName);
      return;
    }
    AnalyticsService.trackPageView(pageName, properties);
  };

  const safeTrackEngagement = (event: 'session_start' | 'session_end' | 'app_open' | 'app_close', properties?: AnalyticsEventProperties) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping engagement tracking:', event);
      return;
    }
    AnalyticsService.trackEngagement(event, properties);
  };

  const safeTrackDataExport = (format: 'csv' | 'json' | 'pdf', recordCount: number, dataTypes: string[]) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping data export tracking');
      return;
    }
    AnalyticsService.trackDataExport(format, recordCount, dataTypes);
  };

  const safeTrackSync = (event: 'sync_start' | 'sync_success' | 'sync_failure', duration?: number, recordCount?: number) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping sync tracking:', event);
      return;
    }
    AnalyticsService.trackSync(event, duration, recordCount);
  };

  const safeTrackConnectivity = (status: 'online' | 'offline', properties?: AnalyticsEventProperties) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping connectivity tracking:', status);
      return;
    }
    AnalyticsService.trackConnectivity(status, properties);
  };

  const safeTrackError = (errorType: string, errorMessage?: string, context?: string) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping error tracking:', errorType);
      return;
    }
    AnalyticsService.trackError(errorType, errorMessage, context);
  };

  const safeIdentifyUser = (userId: string, properties?: AnalyticsEventProperties) => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping user identification');
      return;
    }
    AnalyticsService.identifyUser(userId, properties);
  };

  const safeReset = () => {
    if (!isPostHogReady()) {
      console.warn('PostHog not ready, skipping reset');
      return;
    }
    AnalyticsService.reset();
  };

  return {
    // Direct PostHog access for advanced usage
    posthog,
    
    // Our privacy-first analytics methods (wrapped for safety)
    trackAuth: safeTrackAuth,
    trackDataEvent: safeTrackDataEvent,
    trackFeatureUsage: safeTrackFeatureUsage,
    trackPerformance: safeTrackPerformance,
    trackPageView: safeTrackPageView,
    trackEngagement: safeTrackEngagement,
    trackDataExport: safeTrackDataExport,
    trackSync: safeTrackSync,
    trackConnectivity: safeTrackConnectivity,
    trackError: safeTrackError,
    
    // Analytics preferences (wrapped for safety)
    setEnabled: (enabled: boolean) => {
      try {
        AnalyticsService.setEnabled(enabled);
      } catch (error) {
        console.warn('Failed to set analytics enabled state:', error);
      }
    },
    getEnabled: () => {
      try {
        return AnalyticsService.getEnabled();
      } catch (error) {
        console.warn('Failed to get analytics enabled state:', error);
        return false;
      }
    },
    identifyUser: safeIdentifyUser,
    reset: safeReset,
    
    // Utility methods (don't depend on PostHog)
    getSalaryRange: AnalyticsService.getSalaryRange,
    
    // Helper to check if analytics is ready
    isReady: isPostHogReady,
    
    // Ad blocker detection
    isAdBlockerDetected: () => {
      try {
        return AnalyticsService.isAdBlockerDetected();
      } catch (error) {
        console.warn('Failed to get ad blocker detection state:', error);
        return false;
      }
    },
  };
}