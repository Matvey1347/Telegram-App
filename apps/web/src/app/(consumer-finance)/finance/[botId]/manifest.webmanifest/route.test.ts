import { describe, expect, it } from "vitest";
import { buildFinanceManifest } from "./route";

describe("Finance PWA manifest", () => {
  it("keeps Finance separately installable and scoped to its bot", () => {
    const value = buildFinanceManifest("bot/with spaces");
    expect(value.id).toBe("/finance/bot%2Fwith%20spaces?app=finance");
    expect(value.start_url).toBe(
      "/finance/bot%2Fwith%20spaces?source=pwa",
    );
    expect(value.scope).toBe("/finance/bot%2Fwith%20spaces");
    expect(value.display).toBe("standalone");
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/brand/finance-pwa-192.png" }),
        expect.objectContaining({ src: "/brand/finance-pwa-512.png" }),
      ]),
    );
  });
});
