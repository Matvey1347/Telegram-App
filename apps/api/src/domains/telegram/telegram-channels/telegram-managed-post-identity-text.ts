import { parseTelegramHtml } from '@api/telegram/shared/markup/telegram-html-parser';
import { telegramMarkupToHtml } from '@api/telegram/shared/markup/telegram-markup';

/** Telegram message.text already contains visible text, never managed markup. */
export function normalizeTelegramPlainText(value: string) {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Decode stored managed markup exactly once before comparing visible text. */
export function normalizeManagedPostMarkup(value: string) {
  const safe = (value || '').replace(
    /\[([^\]\n]+)\]\(tg-post:[a-zA-Z0-9_-]+\)/g,
    '$1',
  );
  const [plain] = parseTelegramHtml(telegramMarkupToHtml(safe));
  return normalizeTelegramPlainText(plain);
}
