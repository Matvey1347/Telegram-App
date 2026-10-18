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

const apiProxy = configuredApiProxy(process.env.FINANCE_API_PROXY_URL);

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(gatewayHostname ? [gatewayHostname] : []),
  ],
  async rewrites() {
    if (apiProxy) {
      return [
        {
          source: "/api/:path*",
          destination: `${apiProxy}/api/:path*`,
        },
      ];
    }
    if (process.env.FINANCE_API_PROXY !== "true") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
