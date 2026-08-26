import { toTelegramBotInlineKeyboard } from '../../../telegram/shared/telegram-inline-keyboard';
import { telegramMarkupToHtml } from '../../../telegram/shared/telegram-markup';
import type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';

export type TelegramSystemBotCardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  style?: 'default' | 'primary' | 'success' | 'danger';
};

export function telegramSystemBotPostPreview(
  content: TelegramSystemBotCapturedPostContent | undefined,
) {
  if (!content) return { html: '', buttonRows: [] };
  const formattedText = content.text
    ? telegramMarkupToHtml(content.text)
    : '<i>No text</i>';
  const media = content.imageUrls.length
    ? `\n\n<i>🖼 ${content.imageUrls.length} photo(s) attached</i>`
    : '';
  return {
    html: `${formattedText}${media}`,
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
