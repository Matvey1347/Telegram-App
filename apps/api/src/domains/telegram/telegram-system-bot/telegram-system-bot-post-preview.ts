import { toTelegramBotInlineKeyboard } from '../../../telegram/shared/telegram-inline-keyboard';
import { telegramMarkupToHtml } from '../../../telegram/shared/telegram-markup';
import type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';

export type TelegramSystemBotCardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  style?: 'default' | 'primary' | 'success' | 'danger';
};

export function telegramSystemBotPostPreview(
  content: TelegramSystemBotCapturedPostContent | undefined,
) {
  if (!content)
    return { html: '', buttonRows: [], imageUrl: null, imageCount: 0 };
  const formattedText = content.formattedHtml
    ? content.formattedHtml
    : content.text
      ? telegramMarkupToHtml(content.text)
      : '<i>No text</i>';
  const mediaItems = normalizeTelegramPostMediaItems(
    content.mediaItems,
    content.imageUrls,
  );
  return {
    html: formattedText,
    imageUrl: mediaItems.find((item) => item.kind === 'PHOTO')?.url ?? null,
    imageCount: mediaItems.length,
    buttonRows:
      toTelegramBotInlineKeyboard(content.buttonRows)?.inline_keyboard ?? [],
  };
}

export function escapeSystemBotHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
