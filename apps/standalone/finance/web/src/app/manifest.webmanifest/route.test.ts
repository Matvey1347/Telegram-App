import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFinanceManifest } from "./route";

describe("Finance PWA manifest", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is installed from the standalone Finance root", () => {
    const value = buildFinanceManifest();
    expect(value.id).toBe("/?app=finance");
    expect(value.start_url).toBe("/?source=pwa");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
    expect(value.name).toBe("Groshly");
    expect(value.icons?.[0]?.src).toBe("/brand/groshly-icon-192.png");
  });

  it("uses the marked icon only for local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(buildFinanceManifest().icons?.[0]?.src).toBe("/brand/groshly-dev-icon-192.png");
    vi.stubEnv("NODE_ENV", "production");
    expect(buildFinanceManifest().icons?.[0]?.src).toBe("/brand/groshly-icon-192.png");
  });
});
