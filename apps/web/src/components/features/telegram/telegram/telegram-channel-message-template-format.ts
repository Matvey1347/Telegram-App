import type {
  TelegramMessageTemplateChannelSource,
  TelegramMessageTemplatePriceRounding,
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
    showViews: template.includes("{{views}}"),
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
  const views = layout.showViews ? "{{#views}}\n👁 {{views}} views/post{{/views}}" : "";
  return `{{#channels}}
${heading}${description}${views}
{{#products}}
{{product_name}} — **{{product_price}} {{product_currency}}**
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
  channelGroupLabels?: Record<string, string>;
  overrideInviteLinks?: boolean;
  inviteLinkOverrides?: Record<string, string>;
  excludedProductNames?: string[];
  priceRounding?: TelegramMessageTemplatePriceRounding;
  productNameOverrides?: Record<string, string>;
  bundleOfferEnabled?: boolean;
  bundleDiscountPercent?: number;
  bundleBasePriceOverrides?: Record<string, string>;
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
            product.expectedViews == null ? "—" : String(product.expectedViews),
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
) {
  const overrideId = overrideInviteLinks
    ? inviteLinkOverrides[channel.id]
    : undefined;
  const inviteLink =
    channel.inviteLinks.find((link) => link.id === overrideId) ||
    channel.inviteLinks.find((link) => link.isDefault) ||
    channel.inviteLinks[0];
  let rendered = renderProducts(source, channel, {
    excludedProductNames,
    priceRounding,
    productNameOverrides,
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
  conditional("views", channel.viewsPerPost == null ? null : String(channel.viewsPerPost));
  rendered = replaceToken(rendered, "emoji", channel.emojiSource || "📣");
  rendered = replaceToken(rendered, "title", channel.title);
  rendered = replaceToken(rendered, "description", channel.description || "");
  rendered = replaceToken(rendered, "username", channel.username || "");
  rendered = replaceToken(rendered, "views", channel.viewsPerPost?.toLocaleString() || "");
  rendered = replaceToken(rendered, "tgstat_url", channel.tgStatUrl || "");
  return replaceToken(rendered, "invite_link", inviteLink?.url || "");
}

export function renderTelegramChannelMessageTemplate(
  template: string,
  channels: TelegramMessageTemplateChannelSource[],
  options?: TemplateRenderOptions,
) {
  const priority = new Map((options?.channelOrder || []).map((id, index) => [id, index]));
  const orderedChannels = channels.map((channel, index) => ({ channel, index })).sort((left, right) =>
    (priority.get(left.channel.id) ?? channels.length + left.index) -
    (priority.get(right.channel.id) ?? channels.length + right.index),
  ).map(({ channel }) => channel);
  const groupLabels = options?.channelGroupLabels || {};
  const channelGroups = new Map<string, TelegramMessageTemplateChannelSource[]>();
  if (options?.groupChannels) {
    for (const channel of orderedChannels) {
      const label = groupLabels[channel.id]?.trim() || "";
      channelGroups.set(label, [...(channelGroups.get(label) || []), channel]);
    }
  }
  const displayedChannels = options?.groupChannels
    ? [...channelGroups.values()].flat()
    : orderedChannels;
  const firstInGroup = new Set(
    [...channelGroups.values()].filter((items) => items.length && groupLabels[items[0].id]?.trim()).map((items) => items[0].id),
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
  const renderedChannels = template.replace(
    /{{#channels}}([\s\S]*?){{\/channels}}/g,
    (_match, rawBody: string) => {
      const body = rawBody.replace(/^\r?\n/, "");
      return displayedChannels
        .map((channel, index) => {
          const groupLabel = groupLabels[channel.id]?.trim();
          const groupCount = groupLabel ? channelGroups.get(groupLabel)?.length || 1 : 0;
          const groupHeader = options?.groupChannels && groupLabel && firstInGroup.has(channel.id)
            ? `📂 ${groupLabel} — ${groupCount} ${groupCount === 1 ? "channel" : "channels"}\n`
            : "";
          const rendered = groupHeader + renderChannel(
            body,
            channel,
            overrides,
            Boolean(options?.overrideInviteLinks),
            excludedProductNames,
            priceRounding,
            productNameOverrides,
          );
          return index === displayedChannels.length - 1 ? rendered.trimEnd() : rendered;
        })
        .join("");
    },
  );
  if (!options?.bundleOfferEnabled) return renderedChannels;
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
  const bundleRows = [...grouped.values()]
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
      return `• ${name} у всіх каналах: ~~${original} ${row.currency}~~ → **${discounted} ${row.currency}**`;
    });
  if (!bundleRows.length) return renderedChannels;
  return `${renderedChannels.trimEnd()}\n\n🔥 При розміщенні одразу у всіх ${channels.length} каналах — знижка ${discount}%:\n${bundleRows.join("\n")}`;
}
