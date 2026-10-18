import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    serverActions: {
      allowedOrigins: ["*.vercel.app", "localhost:3000"],
    },
  },
};

export default nextConfig;
