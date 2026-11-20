import type { NextConfig } from "next";
import { securityHeaders as buildSecurityHeaders } from "./src/lib/security-headers";

const securityHeaders = buildSecurityHeaders({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  dev: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
