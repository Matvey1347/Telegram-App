import type { ResolvedEmoji } from '@telegram-system/shared';
import {
  parseTelegramCustomEmojiTokens,
  renderTelegramCustomEmojiToken,
} from '@api/telegram/shared/markup/telegram-custom-emoji-markup';

export const TELEGRAM_BOT_IMAGE_ICON_PREFIX = 'image:';

export type TelegramBotIconTextMessage = {
  text?: string;
  entities?: unknown[];
};

type CustomEmojiEntity = {
  type?: string;
  offset?: number;
  length?: number;
  custom_emoji_id?: string;
};

export function storedTelegramIconPresentation(
  source: string | null | undefined,
  fallback: string,
): ResolvedEmoji {
  const value = source?.trim();
  if (!value) return { type: 'unicode', value: fallback };
  if (
    value.startsWith(TELEGRAM_BOT_IMAGE_ICON_PREFIX) &&
    value.slice(TELEGRAM_BOT_IMAGE_ICON_PREFIX.length)
  ) {
    return {
      type: 'image',
      id: value,
      url: value.slice(TELEGRAM_BOT_IMAGE_ICON_PREFIX.length),
    };
  }
  const custom = parseTelegramCustomEmojiTokens(value)[0];
  if (custom && custom.raw === value) {
    return {
      type: 'unicode',
      value: custom.alt,
      telegramCustomEmojiId: custom.documentId,
    };
  }
  return { type: 'unicode', value };
}

/** An Icon's canonical source is data, never trusted Telegram HTML. */
export function storedTelegramIconText(
  source: string | null | undefined,
  fallback: string,
) {
  const icon = storedTelegramIconPresentation(source, fallback);
  return icon.type === 'unicode' ? icon.value : fallback;
}

export function storedTelegramIconHtml(
  source: string | null | undefined,
  fallback: string,
  customEmojiSupported = true,
) {
  const icon = storedTelegramIconPresentation(source, fallback);
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]!,
    );
  if (icon.type !== 'unicode') return escape(fallback);
  const alt = escape(icon.value);
  return customEmojiSupported && icon.telegramCustomEmojiId
    ? `<tg-emoji emoji-id="${icon.telegramCustomEmojiId}">${alt}</tg-emoji>`
    : alt;
}

/** Preserve ALT and every other entity when a destination rejects custom emoji. */
export function telegramCustomEmojiHtmlFallback(html: string) {
  return html.replace(
    /<tg-emoji\s+emoji-id="[0-9]+">([\s\S]*?)<\/tg-emoji>/gi,
    '$1',
  );
}

export function telegramIconSourceFromText(
  message: TelegramBotIconTextMessage,
) {
  const raw = message.text;
  const text = raw?.trim();
  if (!raw || !text) return null;
  const entities = (message.entities ?? []).filter(
    (value): value is CustomEmojiEntity =>
      Boolean(value && typeof value === 'object'),
  );
  const custom = entities.find(
    (entity) =>
      entity.type === 'custom_emoji' &&
      Number.isInteger(entity.offset) &&
      Number.isInteger(entity.length) &&
      Number(entity.length) > 0 &&
      /^\d+$/.test(entity.custom_emoji_id ?? ''),
  );
  if (custom) {
    const offset = Number(custom.offset);
    const alt = raw.slice(offset, offset + Number(custom.length));
    if (alt && text === alt)
      return renderTelegramCustomEmojiToken(alt, custom.custom_emoji_id!);
  }
  const graphemes = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
  ];
  if (graphemes.length !== 1 || !/\p{Extended_Pictographic}/u.test(text))
    return null;
  return text;
}
