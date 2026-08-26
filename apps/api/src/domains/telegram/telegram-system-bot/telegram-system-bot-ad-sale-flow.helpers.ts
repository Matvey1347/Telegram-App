import { zonedDateTimeToUtc } from '../telegram-ad-sales/domain/timezone';
import type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';

export function parseTelegramSystemBotAdSaleAmount(value: string) {
  const normalized = value.trim().replace(',', '.').replace(/\s+/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function parseTelegramSystemBotAdSaleSchedule(
  value: string,
  timezone: string,
) {
  const trimmed = value.trim();
  const local = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/.exec(trimmed);
  if (local) {
    const [, day, month, year, hour, minute] = local;
    return zonedDateTimeToUtc(
      `${year}-${month}-${day}`,
      `${hour}:${minute}`,
      timezone,
    );
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function telegramSystemBotAdSaleTitle(
  content: TelegramSystemBotCapturedPostContent,
) {
  return (
    content.text
      .split('\n')
      .find((line) => line.trim())
      ?.trim()
      .slice(0, 120) || 'Advertising post'
  );
}
