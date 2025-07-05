import type { NextConfig } from "next";

// Bundle analyzer setup
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
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

export default withBundleAnalyzer(nextConfig);
