import { describe, expect, it } from "vitest";
import { parseUnifiedImportManifest } from "./unified-import-model";

describe("parseUnifiedImportManifest", () => {
  it("accepts all unified import sections", () => {
    const manifest = parseUnifiedImportManifest(JSON.stringify({
      version: 1, groups: [], hypotheses: [], posts: [], schedule: [],
    }));
    expect(manifest.version).toBe(1);
  });

  it("rejects malformed sections before preview", () => {
    expect(() => parseUnifiedImportManifest('{"version":1,"posts":{}}'))
      .toThrow("posts");
  });
});
