import type { NextConfig } from "next";

function configuredDevHostname(value: string | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

const gatewayHostname = configuredDevHostname(
  process.env.NEXT_ALLOWED_DEV_ORIGIN,
);

const nextConfig: NextConfig = {
  // The floating Next.js development badge overlaps Mini App navigation and
  // is not part of the product UI.
  devIndicators: false,
  // Telegram Mini Apps load the dev site through the Cloudflare Tunnel origin.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(gatewayHostname ? [gatewayHostname] : []),
  ],
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
