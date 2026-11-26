import { describe, expect, it } from "vitest";
import { ownPromotionPost, ownPromotionTargets } from "./own-promotion-publications";
import { promotionLinkTitle } from "./own-promotion-invite-links";

describe("own-channel tracking links", () => {
  const shared = "https://t.me/+shared";
  const unique = "https://t.me/+unique";
  const targets = [{
    telegramChannelId: "promoted",
    inviteLinkId: "shared",
    publisherInviteLinks: { first: { id: "unique", url: unique } },
  }];
  const post = {
    title: "Promotion",
    text: `Text ${shared}`,
    formattedHtml: `<a href="${shared}">Open</a>`,
    imageUrls: [],
    buttonRows: [],
  };
  const resolve = () => ({ inviteLink: { id: "shared", url: shared, name: "Shared" } as never });

  it("renders and tracks a different invite link only for the publishing channel with a unique link", () => {
    expect(ownPromotionPost("CUSTOM", post, targets, resolve, "first")).toMatchObject({
      text: `Text ${unique}`, formattedHtml: `<a href="${unique}">Open</a>`,
    });
    expect(ownPromotionPost("CUSTOM", post, targets, resolve, "second")).toMatchObject(post);
    expect(ownPromotionTargets(targets, ["first", "second"])).toEqual([
      { telegramChannelId: "promoted", inviteLinkId: "shared" },
      { telegramChannelId: "promoted", inviteLinkId: "unique", publisherChannelId: "first" },
    ]);
  });

  it("requires ready content and a real link, and preserves placement details in the Telegram title", () => {
    expect(ownPromotionPost("CUSTOM", post, targets, () => undefined, "second")).toBeNull();
    const title = promotionLinkTitle("Very long publishing channel name", "2026-11-25", 1250);
    expect(Array.from(title).length).toBeLessThanOrEqual(32);
    expect(title).toContain("2026-11-25 · 1250");
  });
});
