import { describe, expect, it } from "vitest";
import {
  renderAdSaleBotPreview,
  renderAdSaleInviteLink,
} from "./ad-sale-invite-template";

describe("renderAdSaleInviteLink", () => {
  it("renders the channel-specific invite URL without dropping post metadata", () => {
    expect(
      renderAdSaleInviteLink(
        {
          title: "Advertising post",
          text: "Join {{invite_link}}",
          imageUrls: [],
          buttonRows: [
            [{ text: "Join", url: "{{invite_link}}", style: "primary" }],
          ],
        },
        "https://t.me/+channel_one",
      ),
    ).toEqual({
      title: "Advertising post",
      text: "Join https://t.me/+channel_one",
      imageUrls: [],
      buttonRows: [
        [{ text: "Join", url: "https://t.me/+channel_one", style: "primary" }],
      ],
    });
  });
});

describe("renderAdSaleBotPreview", () => {
  const draft = {
    title: "Advertising post",
    text: "Join {{invite_link}}",
    plainText: "Join {{invite_link}}",
    formattedHtml: "Join {{invite_link}}",
    imageUrls: [],
    buttonRows: [
      [{ text: "Join", url: "{{invite_link}}", style: "primary" as const }],
    ],
  };

  it("renders the first configured placement link before sending the preview", () => {
    expect(
      renderAdSaleBotPreview(draft, " https://t.me/+channel_one "),
    ).toEqual({
      ...draft,
      text: "Join https://t.me/+channel_one",
      plainText: "Join https://t.me/+channel_one",
      formattedHtml: "Join https://t.me/+channel_one",
      buttonRows: [
        [
          {
            text: "Join",
            url: "https://t.me/+channel_one",
            style: "primary",
          },
        ],
      ],
    });
  });

  it("keeps visible placeholders but gives Telegram a valid preview button URL before links are selected", () => {
    expect(renderAdSaleBotPreview(draft, "")).toEqual({
      ...draft,
      buttonRows: [[{ text: "Join", url: "https://t.me", style: "primary" }]],
    });
  });
});
