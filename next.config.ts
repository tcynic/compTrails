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
    // Exclude all manifest files that aren't served (these should NOT be precached)
    'app-build-manifest.json',
    'build-manifest.json', 
    'middleware-manifest.json',
    'prerender-manifest.json',
    'routes-manifest.json',
    'export-marker.json',
    'required-server-files.json',
    // Use regex for patterns
    /\/server\/.*\.js$/,
    /\/server\/.*\.json$/,
    /\/static\/buildManifest\.js$/,
    /\.nft\.json$/,
    /\/trace$/,
    /\/cache\/.*$/,
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
  webpack: (config, { isServer }) => {
    // Handle argon2-browser configuration for proper WASM support
    if (isServer) {
      // Exclude argon2-browser completely from server-side builds
      config.externals = config.externals || [];
      config.externals.push('argon2-browser');
    } else {
      // Client-side: Enable proper bundling of argon2-browser
      // Remove any externals configuration that might interfere
      if (config.externals && typeof config.externals === 'object') {
        delete config.externals['argon2-browser'];
      }
      
      // Ensure resolve configuration doesn't block argon2-browser
      config.resolve = config.resolve || {};
      config.resolve.alias = config.resolve.alias || {};
      
      // Remove any false alias that blocks argon2-browser
      if (config.resolve.alias['argon2-browser'] === false) {
        delete config.resolve.alias['argon2-browser'];
      }
      
      // Configure proper WASM loading
      config.resolve.fallback = config.resolve.fallback || {};
      config.resolve.fallback.fs = false;
      config.resolve.fallback.path = false;
      
      // Add rule for WASM files
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'asset/resource',
      });
      
      // Ensure experiments.asyncWebAssembly is enabled for WASM support
      config.experiments = config.experiments || {};
      config.experiments.asyncWebAssembly = true;
    }

    return config;
  },
  
  // Turbopack-specific configurations (stable as of Next.js 15)
  turbopack: {
    rules: {
      // Turbopack doesn't need argon2-browser server exclusion
      // as it handles client/server boundaries differently
    },
  },
};

export default withBundleAnalyzer(withPWA(nextConfig));
