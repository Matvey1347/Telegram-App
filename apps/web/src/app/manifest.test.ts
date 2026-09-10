import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("Nexeloq PWA manifest", () => {
  it("defines an installable app identity with dedicated icons", () => {
    const value = manifest();
    expect(value.id).toBe("/?app=nexeloq");
    expect(value.start_url).toBe("/?source=pwa");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/brand/nexeloq-pwa-192.png",
          sizes: "192x192",
        }),
        expect.objectContaining({
          src: "/brand/nexeloq-pwa-512.png",
          sizes: "512x512",
        }),
      ]),
    );
  });
});
