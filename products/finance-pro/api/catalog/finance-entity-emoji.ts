import type { ResolvedEmoji } from '@telegram-system/shared';
import { storedTelegramIconPresentation } from '../../../../telegram/shared/telegram-bot-icon-source';
import { renderTelegramCustomEmojiToken } from '../../../../telegram/shared/telegram-custom-emoji-markup';

export const FINANCE_EMOJI_CHOICES = [
  '💵',
  '💳',
  '🏦',
  '💰',
  '🍽️',
  '☕',
  '🚗',
  '🏠',
  '🛍️',
  '💊',
  '🎬',
  '💼',
  '🎁',
  '✈️',
  '📚',
  '🏷️',
] as const;

export function financeAccountEmoji(type?: string | null) {
  return (
    (
      { CASH: '💵', CARD: '💳', SAVINGS: '🏦', OTHER: '💰' } as Record<
        string,
        string
      >
    )[type || ''] || '💰'
  );
}

export function financeCategoryEmoji(
  name?: string | null,
  key?: string | null,
) {
  const value = `${key || ''} ${name || ''}`.toLowerCase();
  if (/food|coffee|кава/.test(value)) return '🍽️';
  if (/transport|fuel/.test(value)) return '🚗';
  if (/home|rent|оренд/.test(value)) return '🏠';
  if (/subscription/.test(value)) return '🔁';
  if (/shopping/.test(value)) return '🛍️';
  if (/health/.test(value)) return '💊';
  if (/entertainment/.test(value)) return '🎬';
  if (/salary/.test(value)) return '💼';
  return '🏷️';
}

export function financeIconPresentation(
  emoji: string | null | undefined,
  fallback: string,
): ResolvedEmoji {
  return storedTelegramIconPresentation(emoji, fallback);
}

export function financeStoredIconSource(
  presentation: ResolvedEmoji | null | undefined,
) {
  if (!presentation) return null;
  if (presentation.type === 'image') return `image:${presentation.url}`;
  return presentation.telegramCustomEmojiId
    ? renderTelegramCustomEmojiToken(
        presentation.value,
        presentation.telegramCustomEmojiId,
      )
    : presentation.value;
}
