import { describe, expect, it } from "vitest";
import type { TelegramPostBatch } from "@telegram-system/shared";
import {
  createAndDispatchPayload,
  createLocalBatch,
  importLocalPost,
  setPostSchedule,
} from "./post-batch-model";

describe("post batch payload", () => {
  it("uses the single supported long-text behavior without exposing a UI mode", () => {
    const batch = createLocalBatch("channel-1") as TelegramPostBatch;
    batch.posts[0].longTextMode = "CAPTION_THEN_TEXT";

    expect(createAndDispatchPayload(batch).posts[0].longTextMode).toBe(
      "IMAGES_THEN_TEXT",
    );
  });

  it("synchronizes scheduled channel overrides with the main publication time", () => {
    const post = createLocalBatch("channel-1").posts[0];
    post.scheduledAt = "2026-09-20T18:05:00.000Z";
    post.channelOverrides = [
      {
        telegramChannelId: "channel-2",
        action: "SCHEDULE",
        scheduledAt: "2026-09-20T19:05:00.000Z",
      },
    ];

    expect(setPostSchedule(post, "SCHEDULE").channelOverrides).toEqual([
      expect.objectContaining({ scheduledAt: "2026-09-20T18:05:00.000Z" }),
    ]);
  });

  it("imports canonical editor markup instead of displaying Telegram HTML tags", () => {
    const batch = createLocalBatch("channel-1");
    const imported = importLocalPost(batch, batch.posts[0].id, {
      title: "Imported",
      text: "**Bold** and [linked](https://example.test)",
      plainText: "Bold and linked",
      formattedHtml:
        '<b>Bold</b> and <a href="https://example.test">linked</a>',
      imageUrls: [],
      mediaItems: [],
      buttonRows: [],
    });

    expect(imported.posts[0].text).toBe(
      "**Bold** and [linked](https://example.test)",
    );
    expect(imported.posts[0].text).not.toContain("<b>");
  });
});
