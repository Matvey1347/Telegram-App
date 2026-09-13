import { describe, expect, it } from "vitest";
import type { TelegramMessageTemplateChannelSource } from "@telegram-system/shared";
import {
  DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
  renderTelegramChannelMessageTemplate,
} from "./telegram-channel-message-template-format";

const channel = (
  id: string,
  title: string,
): TelegramMessageTemplateChannelSource => ({
  id,
  title,
  username: null,
  photoUrl: null,
  tgStatUrl: `https://tgstat.com/${id}`,
  emojiSource: "💼",
  iconPresentation: null,
  defaultInviteLinkId: `${id}-main`,
  inviteLinks: [
    {
      id: `${id}-main`,
      name: "Main",
      url: `https://t.me/+${id}`,
      isDefault: true,
    },
    {
      id: `${id}-other`,
      name: "Other",
      url: `https://t.me/+${id}-other`,
      isDefault: false,
    },
  ],
  products: [{ id: `${id}-p`, name: "1/24", price: "75", currency: "UAH" }],
});

describe("renderTelegramChannelMessageTemplate", () => {
  it("renders every channel and removes the final loop spacing", () => {
    const rendered = renderTelegramChannelMessageTemplate(
      DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
      [channel("one", "One"), channel("two", "Two")],
    );
    expect(rendered).toContain("💼 [One](https://t.me/+one)");
    expect(rendered).toContain("1/24 — **75 UAH**");
    expect(rendered).toContain("**75 UAH**\n\n💼 [Two]");
    expect(rendered).not.toContain("**75 UAH**\n\n\n💼 [Two]");
    expect(rendered.endsWith("\n")).toBe(false);
  });

  it("uses a per-channel link only when overrides are enabled", () => {
    const source = [channel("one", "One")];
    expect(
      renderTelegramChannelMessageTemplate(
        DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
        source,
      ),
    ).toContain("https://t.me/+one");
    expect(
      renderTelegramChannelMessageTemplate(
        DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
        source,
        {
          overrideInviteLinks: true,
          inviteLinkOverrides: { one: "one-other" },
        },
      ),
    ).toContain("https://t.me/+one-other");
  });
});
