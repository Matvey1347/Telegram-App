import type { TelegramMessageTemplateChannelSource } from "@telegram-system/shared";

export const DEFAULT_CHANNEL_MESSAGE_TEMPLATE = `{{#channels}}
{{emoji}} [{{title}}]({{invite_link}}){{#tgstat}} - [TgStat]({{tgstat_url}}){{/tgstat}}
{{#products}}
{{product_name}} — **{{product_price}} {{product_currency}}**
{{/products}}

{{/channels}}`;

function replaceToken(source: string, name: string, value: string) {
  return source.split(`{{${name}}}`).join(value);
}

function renderProducts(
  source: string,
  channel: TelegramMessageTemplateChannelSource,
) {
  return source.replace(
    /{{#products}}([\s\S]*?){{\/products}}/g,
    (_match, productBody: string) =>
      channel.products
        .filter((product) => product.price)
        .map((product) => {
          let rendered = productBody.replace(/^\r?\n/, "");
          rendered = replaceToken(rendered, "product_name", product.name);
          rendered = replaceToken(
            rendered,
            "product_price",
            product.price || "—",
          );
          return replaceToken(
            rendered,
            "product_currency",
            product.currency,
          ).replace(/\r?\n$/, "");
        })
        .join("\n"),
  );
}

function renderChannel(
  source: string,
  channel: TelegramMessageTemplateChannelSource,
  inviteLinkOverrides: Record<string, string>,
  overrideInviteLinks: boolean,
) {
  const overrideId = overrideInviteLinks
    ? inviteLinkOverrides[channel.id]
    : undefined;
  const inviteLink =
    channel.inviteLinks.find((link) => link.id === overrideId) ||
    channel.inviteLinks.find((link) => link.isDefault) ||
    channel.inviteLinks[0];
  let rendered = renderProducts(source, channel);
  rendered = rendered.replace(
    /{{#tgstat}}([\s\S]*?){{\/tgstat}}/g,
    channel.tgStatUrl ? "$1" : "",
  );
  rendered = replaceToken(rendered, "emoji", channel.emojiSource || "📣");
  rendered = replaceToken(rendered, "title", channel.title);
  rendered = replaceToken(rendered, "username", channel.username || "");
  rendered = replaceToken(rendered, "tgstat_url", channel.tgStatUrl || "");
  return replaceToken(rendered, "invite_link", inviteLink?.url || "");
}

export function renderTelegramChannelMessageTemplate(
  template: string,
  channels: TelegramMessageTemplateChannelSource[],
  options?: {
    overrideInviteLinks?: boolean;
    inviteLinkOverrides?: Record<string, string>;
  },
) {
  const overrides = options?.inviteLinkOverrides || {};
  return template.replace(
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
          );
          return index === channels.length - 1 ? rendered.trimEnd() : rendered;
        })
        .join("");
    },
  );
}
