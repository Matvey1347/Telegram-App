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

  it("converts a plain exported post array into a v1 posts manifest", () => {
    const manifest = parseUnifiedImportManifest(
      JSON.stringify([
        {
          title: "Morning post",
          text: "Warm text",
          icon: "🌞",
          urls: ["https://i.pinimg.com/example.jpg"],
        },
        {
          title: "Evening post",
          text: "Evening text",
          imageUrls: ["https://example.com/evening.jpg"],
        },
      ]),
    );

    expect(manifest).toEqual({
      version: 1,
      posts: [
        expect.objectContaining({
          ref: "post-import-1",
          action: "CREATE",
          title: "Morning post",
          icon: "🌞",
          imageUrls: ["https://i.pinimg.com/example.jpg"],
          imported: false,
          approved: false,
        }),
        expect.objectContaining({
          ref: "post-import-2",
          title: "Evening post",
          imageUrls: ["https://example.com/evening.jpg"],
        }),
      ],
    });
  });

  it("reports the malformed item when an imported post array contains a scalar", () => {
    expect(() => parseUnifiedImportManifest('[{"title":"Post"}, 42]')).toThrow(
      "Публикация 2",
    );
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
      'массив schedule обязан содержать ровно N отдельных операций SCHEDULE',
    );
    expect(TELEGRAM_UNIFIED_IMPORT_INSTRUCTION).toContain(
      '"placementMode":"CUSTOM","scheduledAt":"2026-09-20T09:02:00+02:00"',
    );
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
