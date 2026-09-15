import { describe, expect, it } from "vitest";
import type { TelegramMessageTemplateChannelSource } from "@telegram-system/shared";
import {
  buildTelegramChannelMessageTemplate,
  DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
  DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT,
  renderTelegramChannelMessageTemplate,
} from "./telegram-channel-message-template-format";

const channel = (
  id: string,
  title: string,
): TelegramMessageTemplateChannelSource => ({
  id,
  title,
  description: null,
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

  it("can hide formats and round the remaining prices", () => {
    const source = channel("one", "One");
    source.products = [
      { id: "p1", name: "1/24", price: "263.4", currency: "UAH" },
      { id: "p2", name: "3/72", price: "338.4", currency: "UAH" },
    ];

    const rendered = renderTelegramChannelMessageTemplate(
      DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
      [source],
      {
        excludedProductNames: ["3/72"],
        priceRounding: "NEAREST_5",
      },
    );

    expect(rendered).toContain("1/24 — **265 UAH**");
    expect(rendered).not.toContain("3/72");
  });

  it("keeps a channel heading gap without repeating gaps between prices", () => {
    const source = channel("one", "One");
    source.products = [
      { id: "p1", name: "1/24", price: "100", currency: "UAH" },
      { id: "p2", name: "2/48", price: "150", currency: "UAH" },
    ];
    const template = `{{#channels}}
{{title}}
{{#products}}

{{product_name}} — {{product_price}}
{{/products}}
{{/channels}}`;

    expect(renderTelegramChannelMessageTemplate(template, [source])).toBe(
      "One\n\n1/24 — 100\n2/48 — 150",
    );
  });

  it("builds optional channel information without showing empty values", () => {
    const source = channel("one", "One");
    source.description = "A concise channel description";
    source.username = "one_channel";
    const template = buildTelegramChannelMessageTemplate({
      ...DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT,
      showUsername: true,
      showDescription: true,
      showTgStat: false,
    });

    const rendered = renderTelegramChannelMessageTemplate(template, [source]);

    expect(rendered).toContain("(@one_channel)");
    expect(rendered).toContain("A concise channel description");
    expect(rendered).not.toContain("TgStat");

    source.description = null;
    source.username = null;
    const withoutOptionalValues = renderTelegramChannelMessageTemplate(
      template,
      [source],
    );
    expect(withoutOptionalValues).not.toContain("{{description}}");
    expect(withoutOptionalValues).not.toContain("@)");
  });

  it("renames a format and appends a configurable discounted package", () => {
    const first = channel("one", "One");
    first.products = [
      { id: "one-day", name: "1/24", price: "120", currency: "UAH" },
      {
        id: "one-permanent",
        name: "No auto-delete",
        price: "165",
        currency: "UAH",
      },
    ];
    const second = channel("two", "Two");
    second.products = [
      { id: "two-day", name: "1/24", price: "130", currency: "UAH" },
      {
        id: "two-permanent",
        name: "No auto-delete",
        price: "200",
        currency: "UAH",
      },
    ];

    const rendered = renderTelegramChannelMessageTemplate(
      DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
      [first, second],
      {
        priceRounding: "NEAREST_5",
        productNameOverrides: { "No auto-delete": "Без видалення" },
        bundleOfferEnabled: true,
        bundleDiscountPercent: 10,
        bundleBasePriceOverrides: { "1/24": "495" },
      },
    );

    expect(rendered).toContain("Без видалення — **165 UAH**");
    expect(rendered).toContain(
      "🔥 При розміщенні одразу у всіх 2 каналах — знижка 10%:",
    );
    expect(rendered).toContain(
      "• 1/24 у всіх каналах: ~~495 UAH~~ → **445 UAH**",
    );
    expect(rendered).toContain(
      "• Без видалення у всіх каналах: ~~365 UAH~~ → **330 UAH**",
    );
  });
});
