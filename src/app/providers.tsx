'use client';

import { useEffect, Suspense, useState } from "react";
import dynamic from 'next/dynamic';

// Lazy load PostHog components
const LazyPostHogProvider = dynamic(() => import('./posthog-client').then(mod => ({ default: mod.PostHogClient })), {
  ssr: false,
  loading: () => null,
});

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [shouldLoadAnalytics, setShouldLoadAnalytics] = useState(false);

  useEffect(() => {
    // Only load PostHog after user interaction or a delay to reduce initial bundle
    const timer = setTimeout(() => {
      setShouldLoadAnalytics(true);
    }, 2000); // Load after 2 seconds

    // Or load on first user interaction
    const handleInteraction = () => {
      setShouldLoadAnalytics(true);
      clearTimeout(timer);
    };

    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('scroll', handleInteraction, { once: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('scroll', handleInteraction);
    };
  }, []);

  if (!shouldLoadAnalytics) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<>{children}</>}>
      <LazyPostHogProvider>{children}</LazyPostHogProvider>
    </Suspense>
  );
}