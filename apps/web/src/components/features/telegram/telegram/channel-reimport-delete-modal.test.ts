import { describe, expect, it } from "vitest";
import {
  channelDeletionPrompt,
  excludeChannelDeletionItem,
  parseChannelDeletionFile,
} from "./channel-reimport-delete-modal";

describe("parseChannelDeletionFile", () => {
  it("normalizes and deduplicates post and group IDs", () => {
    expect(
      parseChannelDeletionFile(
        '{"postIds":[" post-1 ","post-1"],"groupIds":["group-1"]}',
      ),
    ).toEqual({
      postIds: ["post-1"],
      groupIds: ["group-1"],
    });
  });

  it("rejects an empty destructive file", () => {
    expect(() =>
      parseChannelDeletionFile('{"postIds":[],"groupIds":[]}'),
    ).toThrow("EMPTY_DELETION_FILE");
  });

  it("rejects non-string IDs", () => {
    expect(() => parseChannelDeletionFile('{"postIds":[1]}')).toThrow(
      "INVALID_DELETION_FILE",
    );
  });

  it("explains the destructive scope used by the backend", () => {
    expect(channelDeletionPrompt).toContain(
      "all 10 posts remain and become ungrouped",
    );
    expect(channelDeletionPrompt).toContain(
      "A scheduled post is cancelled in Telegram",
    );
    expect(channelDeletionPrompt).toContain(
      "does not remove the already published Telegram message",
    );
    expect(channelDeletionPrompt).toContain("Other posts and other copies");
  });
});

describe("excludeChannelDeletionItem", () => {
  it("removes only the selected preview item and keeps valid deletion JSON", () => {
    const content = excludeChannelDeletionItem(
      { postIds: ["post-1", "post-2"], groupIds: ["group-1"] },
      "postIds",
      "post-1",
    );

    expect(JSON.parse(content)).toEqual({
      postIds: ["post-2"],
      groupIds: ["group-1"],
    });
  });

  it("clears the import when its final item is excluded", () => {
    expect(
      excludeChannelDeletionItem(
        { postIds: [], groupIds: ["group-1"] },
        "groupIds",
        "group-1",
      ),
    ).toBe("");
  });
});
