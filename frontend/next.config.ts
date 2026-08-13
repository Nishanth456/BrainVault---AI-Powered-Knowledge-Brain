import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "http", hostname: "localhost", port: "8000" },
    ],
  },
  webpack: (config, { dev }) => {
    config.resolve.alias.canvas = false;
    if (dev) {
      config.devtool = "source-map";
    }
    return config;
  },
};

export default nextConfig;
