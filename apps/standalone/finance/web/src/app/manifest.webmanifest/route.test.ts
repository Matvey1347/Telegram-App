import { describe, expect, it } from "vitest";
import { buildFinanceManifest } from "./route";

describe("Finance PWA manifest", () => {
  it("is installed from the standalone Finance root", () => {
    const value = buildFinanceManifest();
    expect(value.id).toBe("/?app=finance");
    expect(value.start_url).toBe("/?source=pwa");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
  });
});
