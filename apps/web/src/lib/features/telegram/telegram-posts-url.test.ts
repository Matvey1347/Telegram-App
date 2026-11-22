import { describe, expect, it } from "vitest";
import {
  buildTelegramPostsLegacyRedirectUrl,
  buildTelegramPostsUrl,
} from "@/lib/features/telegram/telegram-posts-url";

describe("buildTelegramPostsUrl", () => {
  it("builds explicit editor urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        postId: "post-1",
        postView: "editor",
      }),
    ).toBe("/telegram-posts/channel-1/editor?postId=post-1");
  });

  it("builds explicit calendar urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        postView: "calendar",
      }),
    ).toBe("/telegram-posts/channel-1/calendar");
  });

  it("builds a channel-scoped AI Posting url", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        postView: "ai-posting",
      }),
    ).toBe("/telegram-posts/channel-1/ai-posting");
  });

  it("opens AI Posting for a retired group link", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        groupId: "group-1",
        postView: "groups",
      }),
    ).toBe("/telegram-posts/channel-1/ai-posting");
  });

  it("opens AI Posting for a retired hypotheses link", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel-1",
        postView: "hypotheses",
      }),
    ).toBe("/telegram-posts/channel-1/ai-posting");
  });

  it("preserves unrelated query params on canonical urls", () => {
    expect(
      buildTelegramPostsUrl({
        channelId: "channel 1",
        postId: "post-1",
        postView: "editor",
        extraParams: "utm=sidebar&channelId=old&postView=calendar",
      }),
    ).toBe("/telegram-posts/channel%201/editor?utm=sidebar&postId=post-1");
  });
});

describe("buildTelegramPostsLegacyRedirectUrl", () => {
  it("redirects legacy editor urls to canonical urls and preserves extra params", () => {
    expect(
      buildTelegramPostsLegacyRedirectUrl(
        new URLSearchParams(
          "channelId=channel-1&postId=post-1&postView=editor&source=notification",
        ),
      ),
    ).toBe(
      "/telegram-posts/channel-1/editor?source=notification&postId=post-1",
    );
  });

  it("preserves the explicit editor of a grouped legacy link", () => {
    expect(
      buildTelegramPostsLegacyRedirectUrl(
        new URLSearchParams(
          "channelId=channel-1&groupId=group-1&postView=editor&source=sidebar",
        ),
      ),
    ).toBe("/telegram-posts/channel-1/editor?source=sidebar");
  });

  it("defaults to AI Posting and keeps legacy links with a post in the editor", () => {
    expect(buildTelegramPostsLegacyRedirectUrl(new URLSearchParams("channelId=channel-1")))
      .toBe("/telegram-posts/channel-1/ai-posting");
    expect(buildTelegramPostsLegacyRedirectUrl(new URLSearchParams("channelId=channel-1&groupId=old&postId=post-1")))
      .toBe("/telegram-posts/channel-1/editor?postId=post-1");
  });

  it("redirects legacy AI Posting urls to the selected channel route", () => {
    expect(
      buildTelegramPostsLegacyRedirectUrl(
        new URLSearchParams("channelId=channel-1&postView=ai-posting"),
      ),
    ).toBe("/telegram-posts/channel-1/ai-posting");
  });
});
