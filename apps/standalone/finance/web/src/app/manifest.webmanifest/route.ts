import type { MetadataRoute } from "next";

export function buildFinanceManifest(): MetadataRoute.Manifest {
  return {
    id: "/?app=finance",
    name: "Finance",
    short_name: "Finance",
    description: "Personal finance companion for your Telegram Finance bot.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/brand/finance-pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/finance-pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/finance-pwa-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/finance-pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export function GET() {
  return Response.json(buildFinanceManifest(), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/manifest+json",
    },
  });
}
