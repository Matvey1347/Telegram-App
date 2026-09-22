import type {
  TelegramMessageTemplateChannelSource,
  TelegramMessageTemplatePriceRounding,
  TelegramMessageTemplateGroupMode,
} from "@telegram-system/shared";

export const DEFAULT_CHANNEL_MESSAGE_TEMPLATE = `{{#channels}}
{{emoji}} [{{title}}]({{invite_link}}){{#tgstat}} - [TgStat]({{tgstat_url}}){{/tgstat}}
{{#products}}
{{product_name}} — **{{product_price}} {{product_currency}}**
{{/products}}

{{/channels}}`;

export type TelegramChannelMessageTemplatePriceMode = "PUBLIC" | "INTERNAL_CPM";

const PUBLIC_PRICE_TOKEN = "{{product_price}}";
const INTERNAL_PRICE_TOKEN = "{{product_internal_price}}";

export type TelegramChannelMessageTemplateLayout = {
  showEmoji: boolean;
  showTitle: boolean;
  linkTitle: boolean;
  showViews: boolean;
  showTgStat: boolean;
  showDescription: boolean;
};

export const DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT: TelegramChannelMessageTemplateLayout =
  {
    showEmoji: true,
    showTitle: true,
    linkTitle: true,
    showViews: false,
    showTgStat: true,
    showDescription: false,
  };

export function readTelegramChannelMessageTemplateLayout(
  template: string,
): TelegramChannelMessageTemplateLayout {
  return {
    showEmoji: template.includes("{{emoji}}"),
    showTitle: template.includes("{{title}}"),
    linkTitle: template.includes("[{{title}}]({{invite_link}})"),
    showViews:
      template.includes("{{product_expected_views}}") ||
      template.includes("{{views}}"),
    showTgStat: template.includes("{{tgstat_url}}"),
    showDescription: template.includes("{{description}}"),
  };
}

export function buildTelegramChannelMessageTemplate(
  layout: TelegramChannelMessageTemplateLayout,
) {
  const title = layout.showTitle
    ? layout.linkTitle
      ? "[{{title}}]({{invite_link}})"
      : "{{title}}"
    : "";
  const heading = [
    `${layout.showEmoji ? "{{emoji}}" : ""}${layout.showEmoji && title ? " " : ""}${title}`,
    layout.showTgStat ? "{{#tgstat}}- [TgStat]({{tgstat_url}}){{/tgstat}}" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const description = layout.showDescription
    ? "\n{{#description}}{{description}}{{/description}}"
    : "";
  const productViews = layout.showViews
    ? "{{#views}} · 👁 {{product_expected_views}}{{/views}}"
    : "";
  return `{{#channels}}
${heading}${description}
{{#products}}
{{product_name}} — **{{product_price}} {{product_currency}}**${productViews}
{{/products}}

{{/channels}}`;
}

export function readTelegramChannelMessageTemplatePriceMode(
  template: string,
): TelegramChannelMessageTemplatePriceMode {
  return template.includes(INTERNAL_PRICE_TOKEN) ? "INTERNAL_CPM" : "PUBLIC";
}

export function rewriteTelegramChannelMessageTemplatePriceMode(
  template: string,
  mode: TelegramChannelMessageTemplatePriceMode,
) {
  const nextToken =
    mode === "INTERNAL_CPM" ? INTERNAL_PRICE_TOKEN : PUBLIC_PRICE_TOKEN;
  return template.replace(/{{#products}}([\s\S]*?){{\/products}}/g, (block) =>
    block
      .split(PUBLIC_PRICE_TOKEN)
      .join(nextToken)
      .split(INTERNAL_PRICE_TOKEN)
      .join(nextToken),
  );
}

type TemplateRenderOptions = {
  channelOrder?: string[];
  groupChannels?: boolean;
  groupMode?: TelegramMessageTemplateGroupMode;
  channelGroupLabels?: Record<string, string>;
  channelGroupHeaderTemplate?: string | null;
  introText?: string | null;
  audienceSummaryTemplate?: string | null;
  outroText?: string | null;
  overrideInviteLinks?: boolean;
  inviteLinkOverrides?: Record<string, string>;
  excludedProductNames?: string[];
  priceRounding?: TelegramMessageTemplatePriceRounding;
  productNameOverrides?: Record<string, string>;
  bundleOfferEnabled?: boolean;
  bundleDiscountPercent?: number;
  bundleBasePriceOverrides?: Record<string, string>;
  bundleOfferTemplate?: string | null;
};

function replaceToken(source: string, name: string, value: string) {
  return source.split(`{{${name}}}`).join(value);
}

function renderProducts(
  source: string,
  channel: TelegramMessageTemplateChannelSource,
  options: {
    excludedProductNames: ReadonlySet<string>;
    priceRounding: TelegramMessageTemplatePriceRounding;
    productNameOverrides: Record<string, string>;
    hideProductName: boolean;
  },
) {
  return source.replace(
    /{{#products}}([\s\S]*?){{\/products}}/g,
    (_match, productBody: string) => {
      const leadingBreaks = productBody.match(/^(?:\r?\n)+/)?.[0] || "";
      const trailingBreaks = productBody.match(/(?:\r?\n)+$/)?.[0] || "";
      const rowTemplate = productBody.slice(
        leadingBreaks.length,
        trailingBreaks.length ? -trailingBreaks.length : undefined,
      );
      const beforeRows = leadingBreaks.replace(/^\r?\n/, "");
      const afterRows = trailingBreaks.replace(/\r?\n$/, "");
      const rows = channel.products
        .filter(
          (product) =>
            (Boolean(product.price) ||
              rowTemplate.includes(INTERNAL_PRICE_TOKEN)) &&
            !options.excludedProductNames.has(product.name.toLocaleLowerCase()),
        )
        .map((product) => {
          let rendered = rowTemplate;
          if (options.hideProductName) {
            rendered = rendered.replace(
              /{{product_name}}(?:\s*(?:—|-|:)\s*)?/,
              "",
            );
          }
          rendered = rendered.replace(
            /{{#views}}([\s\S]*?){{\/views}}/g,
            channel.viewsPerPost == null ? "" : "$1",
          );
          rendered = replaceToken(
            rendered,
            "product_name",
            options.productNameOverrides[product.name] || product.name,
          );
          rendered = replaceToken(
            rendered,
            "product_price",
            roundPrice(product.price || "—", options.priceRounding),
          );
          rendered = replaceToken(
            rendered,
            "product_internal_price",
            roundPrice(product.internalPrice || "—", options.priceRounding),
          );
          rendered = replaceToken(
            rendered,
            "product_expected_views",
            product.expectedViews == null
              ? "—"
              : product.expectedViews.toLocaleString(),
          );
          rendered = replaceToken(
            rendered,
            "product_public_cpm",
            product.publicCpm || "—",
          );
          rendered = replaceToken(
            rendered,
            "product_internal_cpm",
            product.internalCpm || "—",
          );
          return replaceToken(rendered, "product_currency", product.currency);
        })
        .join("\n");
      return rows ? `${beforeRows}${rows}${afterRows}` : "";
    },
  );
}

function roundPrice(value: string, mode: TelegramMessageTemplatePriceRounding) {
  if (mode === "NONE") return value;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  const step = mode === "NEAREST_5" ? 5 : 10;
  return String(Math.round(numeric / step) * step);
}

function renderChannel(
  source: string,
  channel: TelegramMessageTemplateChannelSource,
  inviteLinkOverrides: Record<string, string>,
  overrideInviteLinks: boolean,
  excludedProductNames: ReadonlySet<string>,
  priceRounding: TelegramMessageTemplatePriceRounding,
  productNameOverrides: Record<string, string>,
  hideProductName: boolean,
) {
  const viewsPerPost = channel.viewsPerPost ?? null;
  const overrideId = overrideInviteLinks
    ? inviteLinkOverrides[channel.id]
    : undefined;
  const inviteLink =
    channel.inviteLinks.find((link) => link.id === overrideId) ||
    channel.inviteLinks.find((link) => link.isDefault) ||
    channel.inviteLinks[0];
  const productSource =
    hideProductName && !source.includes("{{#description}}")
      ? source.replace(/\r?\n(?={{#products}})/, " — ")
      : source;
  let rendered = renderProducts(productSource, channel, {
    excludedProductNames,
    priceRounding,
    productNameOverrides,
    hideProductName,
  });
  const conditional = (name: string, value: string | null) => {
    rendered = rendered.replace(
      new RegExp(`{{#${name}}}([\\s\\S]*?){{\\/${name}}}`, "g"),
      value ? "$1" : "",
    );
  };
  conditional("tgstat", channel.tgStatUrl);
  conditional("username", null);
  conditional("description", channel.description);
  conditional("views", viewsPerPost == null ? null : String(viewsPerPost));
  rendered = replaceToken(rendered, "emoji", channel.emojiSource || "📣");
  rendered = replaceToken(rendered, "title", channel.title);
  rendered = replaceToken(rendered, "description", channel.description || "");
  rendered = replaceToken(rendered, "username", channel.username || "");
  rendered = replaceToken(
    rendered,
    "views",
    viewsPerPost?.toLocaleString() || "",
  );
  rendered = replaceToken(rendered, "tgstat_url", channel.tgStatUrl || "");
  return replaceToken(rendered, "invite_link", inviteLink?.url || "");
}

export function renderTelegramChannelMessageTemplate(
  template: string,
  channels: TelegramMessageTemplateChannelSource[],
  options?: TemplateRenderOptions,
) {
  const priority = new Map(
    (options?.channelOrder || []).map((id, index) => [id, index]),
  );
  const orderedChannels = channels
    .map((channel, index) => ({ channel, index }))
    .sort(
      (left, right) =>
        (priority.get(left.channel.id) ?? channels.length + left.index) -
        (priority.get(right.channel.id) ?? channels.length + right.index),
    )
    .map(({ channel }) => channel);
  const groupLabels = options?.channelGroupLabels || {};
  const groupMode = options?.groupMode ?? "CUSTOM";
  const groupHeaderTemplate =
    options?.channelGroupHeaderTemplate?.trim() ||
    "{{group}} — {{count}} saved channels";
  const networkGroupLabel = (channel: TelegramMessageTemplateChannelSource) =>
    channel.networkGroups[0]?.name || "No network";
  const groupLabelFor = (channel: TelegramMessageTemplateChannelSource) =>
    groupLabels[channel.id]?.trim() ||
    (groupMode === "NETWORK" ? networkGroupLabel(channel) : "");
  const channelGroups = new Map<
    string,
    TelegramMessageTemplateChannelSource[]
  >();
  if (options?.groupChannels) {
    for (const channel of orderedChannels) {
      const label = groupLabelFor(channel);
      channelGroups.set(label, [...(channelGroups.get(label) || []), channel]);
    }
  }
  const displayedChannels = options?.groupChannels
    ? [...channelGroups.values()].flat()
    : orderedChannels;
  const firstInGroup = new Set(
    [...channelGroups.values()]
      .filter((items) => items.length && groupLabelFor(items[0]))
      .map((items) => items[0].id),
  );
  const priceMode = readTelegramChannelMessageTemplatePriceMode(template);
  const overrides = options?.inviteLinkOverrides || {};
  const excludedProductNames = new Set(
    (options?.excludedProductNames || []).map((name) =>
      name.trim().toLocaleLowerCase(),
    ),
  );
  const priceRounding = options?.priceRounding || "NONE";
  const productNameOverrides = options?.productNameOverrides || {};
  const visibleProductNames = new Set(
    displayedChannels.flatMap((channel) =>
      channel.products
        .filter(
          (product) =>
            !excludedProductNames.has(product.name.toLocaleLowerCase()) &&
            (Boolean(product.price) || priceMode === "INTERNAL_CPM"),
        )
        .map((product) => product.name),
    ),
  );
  const hideProductName = visibleProductNames.size === 1;
  const renderedChannels = template.replace(
    /{{#channels}}([\s\S]*?){{\/channels}}/g,
    (_match, rawBody: string) => {
      const body = rawBody.replace(/^\r?\n/, "");
      return displayedChannels
        .map((channel, index) => {
          const groupLabel = groupLabelFor(channel);
          const groupCount = groupLabel
            ? channelGroups.get(groupLabel)?.length || 1
            : 0;
          const groupHeader =
            options?.groupChannels && groupLabel && firstInGroup.has(channel.id)
              ? `${channel.networkGroups[0]?.emojiSource || "📂"} ${groupHeaderTemplate.replaceAll("{{group}}", groupLabel).replaceAll("{{count}}", String(groupCount))}\n`
              : "";
          const rendered =
            groupHeader +
            renderChannel(
              body,
              channel,
              overrides,
              Boolean(options?.overrideInviteLinks),
              excludedProductNames,
              priceRounding,
              productNameOverrides,
              hideProductName,
            );
          if (index === displayedChannels.length - 1) return rendered.trimEnd();
          return hideProductName
            ? rendered.replace(/(?:\r?\n){2,}$/, "\n")
            : rendered;
        })
        .join("");
    },
  );
  const showViews =
    template.includes("{{product_expected_views}}") ||
    template.includes("{{views}}");
  const totalViews = displayedChannels.reduce(
    (total, channel) => total + (channel.viewsPerPost ?? 0),
    0,
  );
  const renderedMessage =
    showViews && totalViews > 0
      ? `${renderedChannels.trimEnd()}\n\n👁 Total views: ${totalViews.toLocaleString()}`
      : renderedChannels;
  const rawTotalSubscribers = channels.reduce(
    (total, channel) => total + (channel.subscribersCount || 0),
    0,
  );
  const totalSubscribers = Math.floor(rawTotalSubscribers / 100) * 100;
  const replaceAudienceToken = (value: string) =>
    value.replaceAll(
      "{{total_subscribers}}",
      totalSubscribers.toLocaleString("uk-UA"),
    );
  const messageBeforeBundle = [
    options?.introText,
    options?.audienceSummaryTemplate,
    renderedMessage,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(replaceAudienceToken)
    .join("");
  const appendOutro = (value: string) =>
    [value, options?.outroText]
      .filter((item): item is string => Boolean(item?.trim()))
      .map(replaceAudienceToken)
      .join("");
  if (!options?.bundleOfferEnabled) return appendOutro(messageBeforeBundle);
  const discount = Math.min(
    100,
    Math.max(0, options.bundleDiscountPercent ?? 10),
  );
  const grouped = new Map<
    string,
    { name: string; currency: string; total: number; channelIds: Set<string> }
  >();
  for (const channel of channels) {
    for (const product of channel.products) {
      const selectedPrice =
        priceMode === "INTERNAL_CPM" ? product.internalPrice : product.price;
      if (
        !selectedPrice ||
        excludedProductNames.has(product.name.toLocaleLowerCase())
      )
        continue;
      const amount = Number(selectedPrice);
      if (!Number.isFinite(amount)) continue;
      const key = `${product.name}\u0000${product.currency}`;
      const row = grouped.get(key) || {
        name: product.name,
        currency: product.currency,
        total: 0,
        channelIds: new Set<string>(),
      };
      row.total += amount;
      row.channelIds.add(channel.id);
      grouped.set(key, row);
    }
  }
  const bundleItems = [...grouped.values()]
    .filter((row) => row.channelIds.size === channels.length)
    .map((row) => {
      const override = Number(options.bundleBasePriceOverrides?.[row.name]);
      const base =
        Number.isFinite(override) && override > 0 ? override : row.total;
      const original = roundPrice(String(base), priceRounding);
      const discounted = roundPrice(
        String(base * (1 - discount / 100)),
        priceRounding,
      );
      const name = productNameOverrides[row.name] || row.name;
      return {
        format: name,
        currency: row.currency,
        original,
        price: discounted,
        row: `• ${name} у всіх каналах: ~~${original} ${row.currency}~~ → **${discounted} ${row.currency}**`,
      };
    });
  if (!bundleItems.length) return appendOutro(messageBeforeBundle);
  const bundleTemplate = options?.bundleOfferTemplate?.trim()
    ? options.bundleOfferTemplate
    : "\n\n🔥 При розміщенні одразу у всіх {{channel_count}} каналах — знижка {{discount_percent}}%:\n{{bundle_rows}}";
  const replaceBundleToken = (source: string, name: string, value: string) =>
    replaceToken(source, name, value);
  const bundleTokens: Array<[string, string]> = [
    ["bundle_rows", bundleItems.map((item) => item.row).join("\n")],
    ["format", bundleItems.map((item) => item.format).join(", ")],
    ["price", bundleItems.map((item) => item.price).join(", ")],
    ["original_price", bundleItems.map((item) => item.original).join(", ")],
    [
      "currency",
      [...new Set(bundleItems.map((item) => item.currency))].join(", "),
    ],
    ["channel_count", String(channels.length)],
    ["discount_percent", String(discount)],
  ];
  const renderedBundle = bundleTokens.reduce(
    (value, [name, replacement]) =>
      replaceBundleToken(value, name, replacement),
    bundleTemplate,
  );
  return appendOutro(`${messageBeforeBundle}${renderedBundle}`);
}
