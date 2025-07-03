import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Exclude argon2-browser from server-side builds
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('argon2-browser');
    }

    return config;
  },
};

export default nextConfig;
