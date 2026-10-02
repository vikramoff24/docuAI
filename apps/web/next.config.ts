import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Dev only: let the app hydrate when opened via 127.0.0.1 (separate storage from localhost) */
  allowedDevOrigins: ["127.0.0.1"],
  /* Proxy API requests to the NestJS backend (port 3001) */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
