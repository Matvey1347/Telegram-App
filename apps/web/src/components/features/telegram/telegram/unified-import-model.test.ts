import { describe, expect, it } from "vitest";
import { TELEGRAM_UNIFIED_IMPORT_INSTRUCTION } from "@telegram-system/shared";
import { parseUnifiedImportManifest } from "./unified-import-model";

describe("parseUnifiedImportManifest", () => {
  it("accepts all unified import sections", () => {
    const manifest = parseUnifiedImportManifest(
      JSON.stringify({
        version: 1,
        groups: [],
        hypotheses: [],
        posts: [],
        schedule: [],
        delete: { groups: [], hypotheses: [], posts: [] },
      }),
    );
    expect(manifest.version).toBe(1);
  });

  it("rejects malformed sections before preview", () => {
    expect(() =>
      parseUnifiedImportManifest('{"version":1,"posts":{}}'),
    ).toThrow("posts");
  });

  it("documents one complete manifest with every supported section", () => {
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain(
      "ТОЧНЫЙ ФОРМАТ ОТВЕТА",
    );
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain('"groups": [');
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain('"hypotheses": [');
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain('"posts": [');
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain('"schedule": [');
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain('"icon": "🧠"');
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain('"icon": "✍️"');
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain('"imported": false');
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain('"approved": false');
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain(
      '"delete":{"groups":[{"id":"точный id группы"}]',
    );
  });

  it("rejects malformed nested delete sections", () => {
    expect(() =>
      parseUnifiedImportManifest(
        '{"version":1,"delete":{"posts":{"id":"post-1"}}}',
      ),
    ).toThrow("delete.posts");
  });
});
