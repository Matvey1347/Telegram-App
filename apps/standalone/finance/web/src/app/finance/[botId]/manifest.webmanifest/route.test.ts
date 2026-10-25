import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("Finance bot PWA manifest", () => {
  it("points the installed app icon at the selected bot's favicon", async () => {
    const response = await GET(new Request("http://localhost:3001/finance/local%20bot/manifest.webmanifest"), {
      params: Promise.resolve({ botId: "local bot" }),
    });
    const manifest = await response.json();
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect(manifest.start_url).toBe("/finance/local%20bot?source=pwa");
    expect(manifest.icons).toEqual([
      expect.objectContaining({
        src: "/api/finance-bots/local%20bot/branding/favicon",
        sizes: "512x512",
        type: "image/png",
      }),
    ]);
  });
});
