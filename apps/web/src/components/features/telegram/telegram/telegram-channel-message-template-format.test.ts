import { describe, expect, it } from "vitest";
import type { TelegramMessageTemplateChannelSource } from "@telegram-system/shared";
import {
  buildTelegramChannelMessageTemplate,
  DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
  DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT,
  readTelegramChannelMessageTemplatePriceMode,
  renderTelegramChannelMessageTemplate,
  rewriteTelegramChannelMessageTemplatePriceMode,
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
  products: [
    {
      id: `${id}-p`,
      name: "1/24",
      price: "75",
      internalPrice: "50",
      expectedViews: 1_000,
      publicCpm: "75",
      internalCpm: "50",
      currency: "UAH",
    },
  ],
});

describe("renderTelegramChannelMessageTemplate", () => {
  it("renders every channel and removes the final loop spacing", () => {
    const rendered = renderTelegramChannelMessageTemplate(
      DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
      [channel("one", "One"), channel("two", "Two")],
    );
    expect(rendered).toContain("💼 [One](https://t.me/+one)");
    expect(rendered).toContain("1/24 — **75 UAH**");
    expect(rendered).toContain("**75 UAH**\n\n💼 [Two]");
    expect(rendered).not.toContain("**75 UAH**\n\n\n💼 [Two]");
    expect(rendered.endsWith("\n")).toBe(false);
  });

  it("uses the saved channel order and groups topics without losing their channels", () => {
    const first = channel("business-1", "Business One");
    const second = channel("growth", "Growth");
    const third = channel("business-2", "Business Two");
    const rendered = renderTelegramChannelMessageTemplate(
      DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
      [first, second, third],
      {
        channelOrder: ["business-2", "growth", "business-1"],
        groupChannels: true,
        channelGroupLabels: {
          "business-1": "Business",
          "business-2": "Business",
          growth: "Self development",
        },
      },
    );

    expect(rendered).toContain("📂 Business — 2 channels");
    expect(rendered).toContain("📂 Self development — 1 channel");
    expect(rendered.indexOf("Business Two")).toBeLessThan(rendered.indexOf("Business One"));
    expect(rendered.indexOf("Business One")).toBeLessThan(rendered.indexOf("Growth"));
  });

  it("does not show a username from an old template", () => {
    const source = channel("one", "One");
    source.username = "old_username";
    const rendered = renderTelegramChannelMessageTemplate(
      "{{#channels}}{{title}}{{#username}} (@{{username}}){{/username}}{{/channels}}",
      [source],
    );
    expect(rendered).toBe("One");
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
      {
        id: "p1",
        name: "1/24",
        price: "263.4",
        internalPrice: "200",
        expectedViews: 1_000,
        publicCpm: "263.4",
        internalCpm: "200",
        currency: "UAH",
      },
      {
        id: "p2",
        name: "3/72",
        price: "338.4",
        internalPrice: "250",
        expectedViews: 1_000,
        publicCpm: "338.4",
        internalCpm: "250",
        currency: "UAH",
      },
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
      {
        id: "p1",
        name: "1/24",
        price: "100",
        internalPrice: "80",
        expectedViews: 1_000,
        publicCpm: "100",
        internalCpm: "80",
        currency: "UAH",
      },
      {
        id: "p2",
        name: "2/48",
        price: "150",
        internalPrice: "120",
        expectedViews: 1_000,
        publicCpm: "150",
        internalCpm: "120",
        currency: "UAH",
      },
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
    source.viewsPerPost = 1_250;
    const template = buildTelegramChannelMessageTemplate({
      ...DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT,
      showViews: true,
      showDescription: true,
      showTgStat: false,
    });

    const rendered = renderTelegramChannelMessageTemplate(template, [source]);

    expect(rendered).toContain("👁 1,250 views/post");
    expect(rendered).toContain("A concise channel description");
    expect(rendered).not.toContain("TgStat");

    source.description = null;
    source.viewsPerPost = null;
    const withoutOptionalValues = renderTelegramChannelMessageTemplate(
      template,
      [source],
    );
    expect(withoutOptionalValues).not.toContain("{{description}}");
    expect(withoutOptionalValues).not.toContain("views/post");
  });

  it("renders internal CPM calculations and keeps missing internal prices explicit", () => {
    const source = channel("one", "One");
    source.description = "Short description from channel settings";
    source.products[0] = {
      ...source.products[0],
      internalPrice: null,
      expectedViews: 1_500,
      publicCpm: "50",
      internalCpm: "32.5",
    };
    const publicTemplate = `${DEFAULT_CHANNEL_MESSAGE_TEMPLATE}\n{{product_price}} outside`;
    const internalTemplate = rewriteTelegramChannelMessageTemplatePriceMode(
      publicTemplate,
      "INTERNAL_CPM",
    );
    const templateWithMetrics = internalTemplate.replace(
      "{{product_currency}}",
      "{{product_currency}} · {{product_expected_views}} views · CPM {{product_internal_cpm}}",
    );

    expect(readTelegramChannelMessageTemplatePriceMode(internalTemplate)).toBe(
      "INTERNAL_CPM",
    );
    expect(internalTemplate).toContain("{{product_internal_price}}");
    expect(internalTemplate).toContain("{{product_price}} outside");
    expect(
      renderTelegramChannelMessageTemplate(templateWithMetrics, [source]),
    ).toContain("1/24 — **— UAH · 1500 views · CPM 32.5**");
  });

  it("renames a format and appends a configurable discounted package", () => {
    const first = channel("one", "One");
    first.products = [
      {
        id: "one-day",
        name: "1/24",
        price: "120",
        internalPrice: "100",
        expectedViews: 1_000,
        publicCpm: "120",
        internalCpm: "100",
        currency: "UAH",
      },
      {
        id: "one-permanent",
        name: "No auto-delete",
        price: "165",
        internalPrice: "140",
        expectedViews: 1_000,
        publicCpm: "165",
        internalCpm: "140",
        currency: "UAH",
      },
    ];
    const second = channel("two", "Two");
    second.products = [
      {
        id: "two-day",
        name: "1/24",
        price: "130",
        internalPrice: "100",
        expectedViews: 1_000,
        publicCpm: "130",
        internalCpm: "100",
        currency: "UAH",
      },
      {
        id: "two-permanent",
        name: "No auto-delete",
        price: "200",
        internalPrice: "160",
        expectedViews: 1_000,
        publicCpm: "200",
        internalCpm: "160",
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

    const internalRendered = renderTelegramChannelMessageTemplate(
      rewriteTelegramChannelMessageTemplatePriceMode(
        DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
        "INTERNAL_CPM",
      ),
      [first, second],
      {
        bundleOfferEnabled: true,
        bundleDiscountPercent: 10,
        productNameOverrides: { "No auto-delete": "Без видалення" },
      },
    );
    expect(internalRendered).toContain("1/24 — **100 UAH**");
    expect(internalRendered).toContain(
      "• 1/24 у всіх каналах: ~~200 UAH~~ → **180 UAH**",
    );
    expect(internalRendered).toContain(
      "• Без видалення у всіх каналах: ~~300 UAH~~ → **270 UAH**",
    );
  });
});
