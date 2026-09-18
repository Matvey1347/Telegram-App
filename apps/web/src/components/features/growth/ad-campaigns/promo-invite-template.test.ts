import { describe, expect, it } from "vitest";
import {
  PROMO_INVITE_LINK_TOKEN,
  renderPromoInviteLink,
  replacePromoInviteLinksWithToken,
  replacePromoTelegramLinksWithToken,
} from "./promo-invite-template";

const post = {
  text: "Join https://t.me/+old and https://t.me/+old",
  formattedHtml: '<a href="https://t.me/+old">Join</a>',
  imageUrls: [],
  buttonRows: [
    [{ text: "Join", url: "https://t.me/+old", style: "default" as const }],
  ],
};

describe("promo invite-link template", () => {
  it("replaces channel links in text, formatted content and buttons", () => {
    const reusable = replacePromoInviteLinksWithToken(post, [
      "https://t.me/+old",
    ]);
    expect(reusable.text).toBe(
      `Join ${PROMO_INVITE_LINK_TOKEN} and ${PROMO_INVITE_LINK_TOKEN}`,
    );
    expect(reusable.formattedHtml).toContain(PROMO_INVITE_LINK_TOKEN);
    expect(reusable.buttonRows[0][0].url).toBe(PROMO_INVITE_LINK_TOKEN);
  });

  it("renders every placeholder using the selected invite link", () => {
    const reusable = replacePromoInviteLinksWithToken(post, [
      "https://t.me/+old",
    ]);
    const rendered = renderPromoInviteLink(reusable, "https://t.me/+new");
    expect(rendered.text).toBe("Join https://t.me/+new and https://t.me/+new");
    expect(rendered.buttonRows[0][0].url).toBe("https://t.me/+new");
  });

  it("turns every Telegram URL in an imported promo into the reusable placeholder", () => {
    const reusable = replacePromoTelegramLinksWithToken({
      text: "Open https://t.me/+old or t.me/channel_name.",
      plainText: "Read https://telegram.me/+other",
      formattedHtml:
        '<a href="https://t.me/+old">Open</a> <a href="https://example.test">Site</a>',
      imageUrls: [],
      buttonRows: [
        [
          { text: "Join", url: "https://t.me/+old", style: "default" },
          { text: "Website", url: "https://example.test", style: "default" },
        ],
      ],
    });

    expect(reusable.text).toBe(
      `Open ${PROMO_INVITE_LINK_TOKEN} or ${PROMO_INVITE_LINK_TOKEN}.`,
    );
    expect(reusable.plainText).toBe(`Read ${PROMO_INVITE_LINK_TOKEN}`);
    expect(reusable.formattedHtml).toContain(
      `href="${PROMO_INVITE_LINK_TOKEN}"`,
    );
    expect(reusable.formattedHtml).toContain("https://example.test");
    expect(reusable.buttonRows[0][0].url).toBe(PROMO_INVITE_LINK_TOKEN);
    expect(reusable.buttonRows[0][1].url).toBe("https://example.test");
  });
});
