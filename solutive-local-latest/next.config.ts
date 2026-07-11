import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-71f6ec03-a092-4ea9-93c7-1929e0e788b2.space.z.ai",
    "*.space.z.ai",
    "192.168.1.11",
    "*.local",
  ],
};

export default nextConfig;
