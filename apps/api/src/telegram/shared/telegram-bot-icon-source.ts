import type { ResolvedEmoji } from '@telegram-system/shared';
import {
  parseTelegramCustomEmojiTokens,
  renderTelegramCustomEmojiToken,
} from './telegram-custom-emoji-markup';

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
