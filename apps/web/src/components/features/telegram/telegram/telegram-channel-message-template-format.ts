import type {
  TelegramMessageTemplateChannelSource,
  TelegramMessageTemplatePriceRounding,
} from "@telegram-system/shared";

export const DEFAULT_CHANNEL_MESSAGE_TEMPLATE = `{{#channels}}
{{emoji}} [{{title}}]({{invite_link}}){{#tgstat}} - [TgStat]({{tgstat_url}}){{/tgstat}}
{{#products}}
{{product_name}} — **{{product_price}} {{product_currency}}**
{{/products}}

{{/channels}}`;

export type TelegramChannelMessageTemplateLayout = {
  showEmoji: boolean;
  showTitle: boolean;
  linkTitle: boolean;
  showUsername: boolean;
  showTgStat: boolean;
  showDescription: boolean;
};

export const DEFAULT_CHANNEL_MESSAGE_TEMPLATE_LAYOUT: TelegramChannelMessageTemplateLayout =
  {
    showEmoji: true,
    showTitle: true,
    linkTitle: true,
    showUsername: false,
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
    showUsername: template.includes("{{username}}"),
    showTgStat: template.includes("{{tgstat_url}}"),
    showDescription: template.includes("{{description}}"),
  };
}

export function buildTelegramChannelMessageTemplate(
  layout: TelegramChannelMessageTemplateLayout,
) {
  const heading = [
    layout.showEmoji ? "{{emoji}}" : "",
    layout.showTitle
      ? layout.linkTitle
        ? "[{{title}}]({{invite_link}})"
        : "{{title}}"
      : "",
    layout.showUsername ? "{{#username}}(@{{username}}){{/username}}" : "",
    layout.showTgStat ? "{{#tgstat}}- [TgStat]({{tgstat_url}}){{/tgstat}}" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const description = layout.showDescription
    ? "\n{{#description}}{{description}}{{/description}}"
    : "";
  return `{{#channels}}
${heading}${description}
{{#products}}
{{product_name}} — **{{product_price}} {{product_currency}}**
{{/products}}

{{/channels}}`;
}

type TemplateRenderOptions = {
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
            product.price &&
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
  conditional("username", channel.username);
  conditional("description", channel.description);
  rendered = replaceToken(rendered, "emoji", channel.emojiSource || "📣");
  rendered = replaceToken(rendered, "title", channel.title);
  rendered = replaceToken(rendered, "description", channel.description || "");
  rendered = replaceToken(rendered, "username", channel.username || "");
  rendered = replaceToken(rendered, "tgstat_url", channel.tgStatUrl || "");
  return replaceToken(rendered, "invite_link", inviteLink?.url || "");
}

export function renderTelegramChannelMessageTemplate(
  template: string,
  channels: TelegramMessageTemplateChannelSource[],
  options?: TemplateRenderOptions,
) {
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
      return channels
        .map((channel, index) => {
          const rendered = renderChannel(
            body,
            channel,
            overrides,
            Boolean(options?.overrideInviteLinks),
            excludedProductNames,
            priceRounding,
            productNameOverrides,
          );
          return index === channels.length - 1 ? rendered.trimEnd() : rendered;
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
      if (
        !product.price ||
        excludedProductNames.has(product.name.toLocaleLowerCase())
      )
        continue;
      const amount = Number(product.price);
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
