import type { NextConfig } from "next";

// Bundle analyzer setup
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

// PWA plugin setup
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  scope: '/',
  sw: 'sw.js',
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'offlineCache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
  fallbacks: {
    document: '/offline.html', // Create a simple offline page
  },
  publicExcludes: ['!robots.txt', '!sitemap.xml'],
});

const nextConfig: NextConfig = {
  // Conditionally apply webpack config only for production builds
  // This prevents the Turbopack warning in development
  ...(process.env.NODE_ENV === 'production' && {
    webpack: (config, { isServer }) => {
      // Exclude argon2-browser from server-side builds
      if (isServer) {
        config.externals = config.externals || [];
        config.externals.push('argon2-browser');
      }

      return config;
    },
  }),
  
  // Turbopack-specific configurations (stable as of Next.js 15)
  turbopack: {
    rules: {
      // Turbopack doesn't need argon2-browser server exclusion
      // as it handles client/server boundaries differently
    },
  },
};

export default withBundleAnalyzer(withPWA(nextConfig));
