import type { NextConfig } from "next";

const publicApiOrigin = process.env.NEXT_PUBLIC_API_URL
  ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
  : undefined;

const nextConfig: NextConfig = {
  // Telegram Mini Apps load the dev site through the ngrok origin.
  allowedDevOrigins: publicApiOrigin ? [publicApiOrigin] : [],
  async rewrites() {
    if (process.env.LOCAL_API_PROXY !== "true") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
