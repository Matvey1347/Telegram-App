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
  subscribersCount: 1_000,
  networkGroups: [],
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
    expect(rendered).toContain(
      "💼 [One](https://t.me/+one) - [TgStat](https://tgstat.com/one) — **75 UAH**",
    );
    expect(rendered).not.toContain("1/24 — **75 UAH**");
    expect(rendered).toContain("**75 UAH**\n💼 [Two]");
    expect(rendered).not.toContain("**75 UAH**\n\n💼 [Two]");
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

    expect(rendered).toContain("📂 Business — 2 saved channels");
    expect(rendered).toContain("📂 Self development — 1 saved channels");
    expect(rendered.indexOf("Business Two")).toBeLessThan(
      rendered.indexOf("Business One"),
    );
    expect(rendered.indexOf("Business One")).toBeLessThan(
      rendered.indexOf("Growth"),
    );
  });

  it("groups channels by their network and uses the custom group heading", () => {
    const first = channel("business-1", "Business One");
    const second = channel("business-2", "Business Two");
    first.networkGroups = [{ name: "Business", emojiSource: "💼" }];
    second.networkGroups = [{ name: "Business", emojiSource: "💼" }];

    const rendered = renderTelegramChannelMessageTemplate(
      DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
      [first, second],
      {
        groupChannels: true,
        groupMode: "NETWORK",
        channelGroupHeaderTemplate: "{{group}}: {{count}} каналов",
      },
    );

    expect(rendered).toContain("💼 Business: 2 каналов");
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

    expect(rendered).toContain("**265 UAH**");
    expect(rendered).not.toContain("1/24 — **265 UAH**");
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
      showProductViews: true,
      showDescription: true,
      showTgStat: false,
    });

    const rendered = renderTelegramChannelMessageTemplate(template, [source]);

    expect(rendered).toContain("**75 UAH** · 👁 1,000");
    expect(rendered).toContain("👁 Total views:\n1/24 — 1,000");
    expect(rendered).toContain("A concise channel description");
    expect(rendered).not.toContain("TgStat");

    source.description = null;
    source.viewsPerPost = null;
    const withoutOptionalValues = renderTelegramChannelMessageTemplate(
      template,
      [source],
    );
    expect(withoutOptionalValues).not.toContain("{{description}}");
    expect(withoutOptionalValues).not.toContain("👁");
    expect(withoutOptionalValues).not.toContain("Total views:");
  });

  it("renders the title and invite URL separately when that layout is selected", () => {
    const template = buildTelegramChannelMessageTemplate({
      ...DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT,
      titleLinkMode: "SEPARATE",
      showTgStat: false,
    });

    expect(
      renderTelegramChannelMessageTemplate(template, [channel("one", "One")]),
    ).toContain("💼 One — https://t.me/+one");
  });

  it("renders selected format views without showing a price", () => {
    const source = channel("one", "One");
    source.viewsPerPost = 1_250;
    source.products[0].expectedViews = 1_524;
    const template = buildTelegramChannelMessageTemplate({
      ...DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT,
      showProductViews: true,
      showTgStat: false,
    });

    const rendered = renderTelegramChannelMessageTemplate(template, [source], {
      excludedProductNames: ["1/24"],
      showProductViews: true,
      viewProductNames: ["1/24"],
      showTotalViews: true,
      viewsEmoji: "👀",
      totalViewsLabel: "Перегляди всього",
      viewsRounding: "NEAREST_100",
    });

    expect(rendered).toContain("1/24 · 👀 1,500");
    expect(rendered).not.toContain("75 UAH");
    expect(rendered).toContain("👀 Перегляди всього:\n1/24 — 1,500");
  });

  it("keeps prices out of view-only rows and totals every selected format", () => {
    const first = channel("one", "One");
    const second = channel("two", "Two");
    first.viewsPerPost = 1_346;
    second.viewsPerPost = 3_139;
    first.products = [
      {
        ...first.products[0],
        name: "1/24",
        price: "192.6",
        expectedViews: 642,
      },
      {
        ...first.products[0],
        id: "one-48",
        name: "2/48",
        price: "211.2",
        expectedViews: 704,
      },
    ];
    second.products = [
      {
        ...second.products[0],
        name: "1/24",
        price: "352.44",
        expectedViews: 1_602,
      },
      {
        ...second.products[0],
        id: "two-48",
        name: "2/48",
        price: "338.14",
        expectedViews: 1_537,
      },
    ];
    const template = buildTelegramChannelMessageTemplate({
      ...DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT,
      showProductViews: true,
      showTgStat: false,
    });

    const rendered = renderTelegramChannelMessageTemplate(
      template,
      [first, second],
      {
        excludedProductNames: ["1/24", "2/48"],
        showProductViews: true,
        viewProductNames: ["1/24", "2/48"],
        showTotalViews: true,
        viewsEmoji: "👁",
        priceCurrency: "UAH",
        productNameOverrides: { "2/48": "Дві доби" },
      },
    );

    expect(rendered).toContain("1/24 · 👁 642");
    expect(rendered).toContain("Дві доби · 👁 1,537");
    expect(rendered).not.toContain("192.6UAH");
    expect(rendered).not.toContain("338.14UAH");
    expect(rendered).toContain(
      "👁 Total views:\n1/24 — 2,244\nДві доби — 2,241",
    );
  });

  it("can remove the blank line between channel entries", () => {
    const template = buildTelegramChannelMessageTemplate({
      ...DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT,
      separateChannels: false,
    });

    expect(template).toContain("{{/products}}\n{{/channels}}");
    expect(template).not.toContain("{{/products}}\n\n{{/channels}}");
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
    ).toContain("**— UAH · 1,500 views · CPM 32.5**");
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
        outroText: "Closing note",
      },
    );

    expect(rendered).toContain("Без видалення - **165 UAH**");
    expect(rendered).toContain(
      "🔥 При розміщенні одразу у всіх 2 каналах — знижка 10%:",
    );
    expect(rendered).toContain(
      "• 1/24 у всіх каналах: ~~495 UAH~~ → **445 UAH**",
    );
    expect(rendered).toContain(
      "• Без видалення у всіх каналах: ~~365 UAH~~ → **330 UAH**",
    );
    expect(rendered).toMatch(/знижка 10%:[\s\S]*Closing note$/);

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
    expect(internalRendered).toContain("1/24 - **100 UAH**");
    expect(internalRendered).toContain(
      "• 1/24 у всіх каналах: ~~200 UAH~~ → **180 UAH**",
    );
    expect(internalRendered).toContain(
      "• Без видалення у всіх каналах: ~~300 UAH~~ → **270 UAH**",
    );

    const targetAfterDiscount = renderTelegramChannelMessageTemplate(
      DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
      [first, second],
      {
        targetTotal: "700",
        bundleOfferEnabled: true,
        bundleDiscountPercent: 10,
      },
    );
    expect(targetAfterDiscount).toContain(
      "• 1/24 у всіх каналах: ~~316.17 UAH~~ → **284.55 UAH**",
    );
    expect(targetAfterDiscount).toContain(
      "• No auto-delete у всіх каналах: ~~461.61 UAH~~ → **415.45 UAH**",
    );
  });

  it("puts a single format price beside each channel and lets copy control spacing", () => {
    const first = channel("one", "One");
    const second = channel("two", "Two");

    const rendered = renderTelegramChannelMessageTemplate(
      DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
      [first, second],
      {
        introText: "📌 Наші канали:\n",
        bundleOfferEnabled: true,
        bundleOfferTemplate:
          "\n\n💰 {{price}} {{currency}} у всі — {{format}}\n\nВІДГУКИ!\n",
        outroText: "🙏 Дякую за ваш час!",
      },
    );

    expect(rendered).toContain("📌 Наші канали:\n💼 [One]");
    expect(rendered).not.toContain("1/24 — **75 UAH**");
    expect(rendered).toContain("💰 135 UAH у всі — 1/24");
    expect(rendered).toContain("ВІДГУКИ!\n🙏 Дякую за ваш час!");
  });
});
