import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexeloq Telegram System",
    short_name: "Nexeloq",
    description: "Telegram operations and CRM workspace",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/brand/telegram-system-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/telegram-system-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
