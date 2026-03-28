import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Next.js 16 defaults to 10MB body buffering when proxy is involved.
    // Raise this limit so large image uploads through route handlers are not truncated.
    proxyClientMaxBodySize: "256mb",
  },
};

export default nextConfig;
