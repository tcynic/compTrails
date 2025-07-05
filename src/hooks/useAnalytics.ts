'use client';

import { usePostHog } from 'posthog-js/react';
import { AnalyticsService } from '@/services/analyticsService';

/**
 * Custom hook that combines PostHog React hooks with our privacy-first analytics service
 */
export function useAnalytics() {
  const posthog = usePostHog();

  return {
    // Direct PostHog access for advanced usage
    posthog,
    
    // Our privacy-first analytics methods
    trackAuth: AnalyticsService.trackAuth,
    trackDataEvent: AnalyticsService.trackDataEvent,
    trackFeatureUsage: AnalyticsService.trackFeatureUsage,
    trackPerformance: AnalyticsService.trackPerformance,
    trackPageView: AnalyticsService.trackPageView,
    trackEngagement: AnalyticsService.trackEngagement,
    trackDataExport: AnalyticsService.trackDataExport,
    trackSync: AnalyticsService.trackSync,
    trackConnectivity: AnalyticsService.trackConnectivity,
    trackError: AnalyticsService.trackError,
    
    // Analytics preferences
    setEnabled: AnalyticsService.setEnabled,
    getEnabled: AnalyticsService.getEnabled,
    identifyUser: AnalyticsService.identifyUser,
    reset: AnalyticsService.reset,
    
    // Utility methods
    getSalaryRange: AnalyticsService.getSalaryRange,
  };
}