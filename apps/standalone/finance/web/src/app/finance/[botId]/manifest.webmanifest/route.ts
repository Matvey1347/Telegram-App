import type { MetadataRoute } from "next";

function buildManifest(botId: string): MetadataRoute.Manifest {
  const appPath = `/finance/${encodeURIComponent(botId)}`;
  return {
    id: `${appPath}?app=finance`,
    name: "Groshly",
    short_name: "Groshly",
    description: "Personal finance companion for your Telegram Finance bot.",
    start_url: `${appPath}?source=pwa`,
    scope: appPath,
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["finance", "productivity"],
    icons: [{
      src: "/brand/groshly-icon.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    }],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ botId: string }> },
) {
  const { botId } = await params;
  return Response.json(buildManifest(botId), {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/manifest+json",
    },
  });
}
