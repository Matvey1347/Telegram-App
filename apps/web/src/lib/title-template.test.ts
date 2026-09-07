import { describe, expect, it } from "vitest";
import { resolveTitleTemplate } from "@telegram-system/shared";

describe("resolveTitleTemplate", () => {
  it("resolves repeated and differently cased built-in tokens", () => {
    expect(
      resolveTitleTemplate("[date] // [DATE]", { date: "2026-09-08" }),
    ).toBe("2026-09-08 // 2026-09-08");
  });

  it("supports several different built-in tokens in one title", () => {
    expect(
      resolveTitleTemplate("[date-range] // [channel]", {
        "date-range": "2026-09-08 — 2026-09-15",
        channel: "News",
      }),
    ).toBe("2026-09-08 — 2026-09-15 // News");
  });

  it("keeps unknown tokens and removes a known token without a value", () => {
    expect(
      resolveTitleTemplate("Folder [future] [date-range]", {
        "date-range": null,
      }),
    ).toBe("Folder [future]");
  });
});
