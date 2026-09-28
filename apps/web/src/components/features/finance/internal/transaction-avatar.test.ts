import { describe, expect, it } from "vitest";
import { transactionAvatar } from "./transaction-avatar";

describe("transactionAvatar", () => {
  it("uses the transaction's explicitly selected icon only as a final fallback", () => {
    const icon = { type: "unicode", value: "💸" } as const;
    expect(
      transactionAvatar({
        iconPresentation: icon,
      } as never),
    ).toEqual(icon);
  });

  it("uses channel artwork before the category emoji", () => {
    expect(
      transactionAvatar({
        iconPresentation: null,
        telegramChannel: {
          id: "channel-1",
          title: "News",
          photoUrl: "https://cdn.example.com/channel.jpg",
        },
        member: {
          avatarPresentation: { type: "unicode", value: "👤" },
        },
        categoryRef: {
          iconPresentation: { type: "unicode", value: "💰" },
        },
      } as never),
    ).toEqual({
      type: "image",
      id: "channel-1",
      url: "https://cdn.example.com/channel.jpg",
      name: "News",
    });
  });

  it("uses the selected investor avatar for the Investment category", () => {
    const avatar = {
      type: "image",
      id: "member-1",
      url: "https://cdn.example.com/member.jpg",
    } as const;
    expect(
      transactionAvatar({
        iconPresentation: null,
        member: { avatarPresentation: avatar },
        assignedMember: {
          avatarPresentation: { type: "unicode", value: "👨‍💻" },
        },
        categoryRef: {
          key: "investment",
          name: "Investment",
          iconPresentation: { type: "unicode", value: "💰" },
        },
      } as never),
    ).toEqual(avatar);
  });

  it("keeps the category emoji for an ordinary member-assigned transaction", () => {
    const categoryIcon = { type: "unicode", value: "💻" } as const;
    expect(
      transactionAvatar({
        iconPresentation: null,
        assignedMember: {
          avatarPresentation: {
            type: "image",
            id: "member-1",
            url: "https://cdn.example.com/member.jpg",
          },
        },
        categoryRef: { iconPresentation: categoryIcon },
      } as never),
    ).toEqual(categoryIcon);
  });
});
