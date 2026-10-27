import type { MetadataRoute } from "next";

export function buildFinanceManifest(): MetadataRoute.Manifest {
  const icon = process.env.NODE_ENV === "development" ? "/brand/groshly-dev-icon.png" : "/brand/groshly-icon.png";
  const smallIcon = process.env.NODE_ENV === "development" ? "/brand/groshly-dev-icon-192.png" : "/brand/groshly-icon-192.png";
  return {
    id: "/?app=finance",
    name: "Groshly",
    short_name: "Groshly",
    description: "Your accounts, spending, debts and insights in one place.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8f2",
    theme_color: "#123d2d",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: smallIcon,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
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
