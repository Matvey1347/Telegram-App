import { describe, expect, it } from "vitest";
import { parsePostGroupImportContent } from "./post-groups-import-model";

describe("parsePostGroupImportContent", () => {
  it("normalizes group JSON including icon and member aliases", () => {
    expect(
      parsePostGroupImportContent(
        JSON.stringify({
          groups: [{ title: " Books ", icon: "📚", member: "member-1" }],
        }),
      ),
    ).toEqual([
      {
        title: "Books",
        description: null,
        icon: "📚",
        createdByMemberId: "member-1",
        statusNumberingEnabled: false,
        postIds: [],
      },
    ]);
  });

  it("rejects invalid and duplicate rows before creating anything", () => {
    expect(() => parsePostGroupImportContent("not json")).toThrow("valid JSON");
    expect(() =>
      parsePostGroupImportContent('[{"title":"One"},{"title":"one"}]'),
    ).toThrow("Duplicate group title");
    expect(() =>
      parsePostGroupImportContent('[{"title":"One","postIds":["post-1","post-1"]}]'),
    ).toThrow("postIds must be unique strings");
  });
});
