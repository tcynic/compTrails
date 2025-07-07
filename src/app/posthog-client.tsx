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
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
        
        // Privacy-first configuration
        capture_pageview: false, // We'll handle this manually
        capture_pageleave: true,
        disable_session_recording: false,
        autocapture: false, // We'll track events manually for better control
        
        // Privacy settings
        respect_dnt: true,
        opt_out_capturing_by_default: ENVIRONMENT === 'development',
        
        // Custom configuration for CompTrails
        property_blacklist: ['$current_url', '$host', '$pathname'],
        sanitize_properties: (properties) => {
          // Remove any potentially sensitive data
          const sanitized = { ...properties };
          
          // Remove any properties that might contain PII
          delete sanitized.$current_url;
          delete sanitized.$referrer;
          delete sanitized.$referring_domain;
          
          return sanitized;
        },
        
        loaded: (posthog) => {
          // Set user properties that are safe for privacy
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
        },
      });
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