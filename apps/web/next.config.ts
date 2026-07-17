import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@douyin-local-life/shared"]
};

export default nextConfig;
