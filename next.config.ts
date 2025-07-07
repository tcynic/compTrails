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
  
  // Exclude problematic build files that cause 404 errors
  buildExcludes: [
    /app-build-manifest\.json$/,
    /build-manifest\.json$/,
    /middleware-manifest\.json$/,
    /server\/.*\.js$/,
    /static\/buildManifest\.js$/,
  ],
  
  // Exclude files from public directory that shouldn't be precached
  publicExcludes: [
    '!robots.txt', 
    '!sitemap.xml',
    '!favicon.ico',
    '!manifest.json'
  ],
  
  // More conservative runtime caching approach
  runtimeCaching: [
    // Cache pages with NetworkFirst strategy
    {
      urlPattern: /^https?.*\/_next\/static\/.*/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-cache',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // Cache application pages
    {
      urlPattern: /^https?.*\/(dashboard|login|settings).*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // Cache API routes with NetworkFirst (shorter cache time)
    {
      urlPattern: /^https?.*\/api\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 2,
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 5 * 60, // 5 minutes
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // Cache other resources with NetworkFirst as fallback
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'general-cache',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60, // 1 hour
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
  
  fallbacks: {
    document: '/offline.html',
  },
  
  // More lenient caching options
  cacheOnFrontEndNav: true,
  reloadOnOnline: false,
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
