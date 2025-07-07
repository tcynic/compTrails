'use client';

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { usePostHog } from 'posthog-js/react';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { AnalyticsService } from '@/services/analyticsService';

// PostHog configuration
const ENVIRONMENT = process.env.NEXT_PUBLIC_ENVIRONMENT || 'development';

export function PostHogClient({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      // Test if PostHog can load by making a simple request
      const testPostHogAvailability = async () => {
        try {
          const testUrl = `${process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'}/health`;
          await fetch(testUrl, { 
            method: 'HEAD', 
            mode: 'no-cors',
            signal: AbortSignal.timeout(3000) // 3 second timeout
          });
          return true;
        } catch {
          console.warn('PostHog connectivity check failed, likely blocked by ad blocker or privacy extension');
          return false;
        }
      };

      // Initialize PostHog with ad blocker compatibility settings
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        
        // Privacy-first and ad blocker friendly configuration
        capture_pageview: false, // We'll handle this manually
        capture_pageleave: true,
        disable_session_recording: true, // Disabled to avoid ad blocker triggers
        autocapture: false, // We'll track events manually for better control
        disable_scroll_properties: true, // Reduce tracking surface
        
        // Reduce network requests that might be blocked
        feature_flag_request_timeout_ms: 1000, // Shorter timeout
        disable_compression: false,
        
        // Privacy settings
        respect_dnt: true,
        opt_out_capturing_by_default: ENVIRONMENT === 'development',
        
        // Custom configuration for CompTrails
        property_blacklist: ['$current_url', '$host', '$pathname', '$screen_height', '$screen_width'],
        sanitize_properties: (properties) => {
          // Remove any potentially sensitive data
          const sanitized = { ...properties };
          
          // Remove any properties that might contain PII or trigger ad blockers
          delete sanitized.$current_url;
          delete sanitized.$referrer;
          delete sanitized.$referring_domain;
          delete sanitized.$screen_height;
          delete sanitized.$screen_width;
          delete sanitized.$viewport_height;
          delete sanitized.$viewport_width;
          
          return sanitized;
        },
        
        loaded: (posthog) => {
          // Check if PostHog actually loaded successfully
          if (!posthog || typeof posthog.capture !== 'function') {
            console.warn('PostHog failed to load properly, analytics will be disabled');
            AnalyticsService.setEnabled(false);
            return;
          }

          // Set user properties that are safe for privacy
          try {
            posthog.register({
              environment: ENVIRONMENT,
              app_version: '0.1.0',
            });

            // Don't track in development unless explicitly enabled
            if (ENVIRONMENT === 'development') {
              posthog.opt_out_capturing();
            }

            // Initialize the analytics service now that PostHog is loaded
            AnalyticsService.initialize();
            console.log('PostHog analytics initialized successfully');
          } catch (error) {
            console.warn('PostHog initialization failed:', error);
            AnalyticsService.setEnabled(false);
          }
        },
        
        // Handle initialization errors gracefully
        on_request_error: (error) => {
          console.warn('PostHog request failed (likely blocked):', error);
          AnalyticsService.setAdBlockerDetected(true);
        },
      });

      // Test connectivity and handle ad blocker scenarios
      testPostHogAvailability().then((available) => {
        if (!available) {
          console.log('Analytics disabled due to network restrictions (ad blocker or privacy extension)');
          AnalyticsService.setAdBlockerDetected(true);
        }
      });
    } else {
      // No PostHog key provided, disable analytics
      AnalyticsService.setEnabled(false);
    }
  }, []);

  return (
    <PHProvider client={posthog}>
      {children}
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
    </PHProvider>
  );
}

function PostHogPageView(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (pathname && posthog && typeof posthog.capture === 'function') {
      try {
        let url = window.location.origin + pathname;
        if (searchParams.toString()) {
          url = url + '?' + searchParams.toString();
        }
        posthog.capture('$pageview', {
          $current_url: url,
        });
      } catch (error) {
        console.warn('PostHog pageview tracking failed:', error);
      }
    }
  }, [pathname, searchParams, posthog]);

  return null;
}