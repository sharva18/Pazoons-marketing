import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // CSV imports are sent to a server action; a few thousand customers is a few hundred KB.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
