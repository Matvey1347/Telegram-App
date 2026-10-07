import { describe, expect, it } from "vitest";
import { renderAdSaleInviteLink } from "./ad-sale-invite-template";

describe("renderAdSaleInviteLink", () => {
  it("renders the channel-specific invite URL without dropping post metadata", () => {
    expect(
      renderAdSaleInviteLink(
        {
          title: "Advertising post",
          text: "Join {{invite_link}}",
          imageUrls: [],
          buttonRows: [[{ text: "Join", url: "{{invite_link}}", style: "primary" }]],
        },
        "https://t.me/+channel_one",
      ),
    ).toEqual({
      title: "Advertising post",
      text: "Join https://t.me/+channel_one",
      imageUrls: [],
      buttonRows: [[{ text: "Join", url: "https://t.me/+channel_one", style: "primary" }]],
    });
  });
});
