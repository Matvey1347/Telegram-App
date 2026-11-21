import { resolve } from "node:path";
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
  process.env.FINANCE_ALLOWED_DEV_ORIGIN,
);

function configuredApiProxy(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin.replace(/\/$/u, "") : undefined;
  } catch {
    return undefined;
  }
}

const localApiProxy = process.env.FINANCE_API_PROXY === "true";
const apiProxy = configuredApiProxy(process.env.FINANCE_API_PROXY_URL);
const apiTarget = process.env.NODE_ENV === "development" && localApiProxy
  ? "http://127.0.0.1:4001"
  : apiProxy ?? (localApiProxy ? "http://127.0.0.1:4001" : undefined);

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: { root: resolve(__dirname, "../../../..") },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(gatewayHostname ? [gatewayHostname] : []),
  ],
  async rewrites() {
    if (!apiTarget) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
