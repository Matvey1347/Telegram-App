import { describe, expect, it } from "vitest";
import {
  PROMO_INVITE_LINK_TOKEN,
  renderPromoInviteLink,
  replacePromoInviteLinksWithToken,
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
});
