import type { ResolvedEmoji } from '@telegram-system/shared';

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
  return { type: 'unicode', value: emoji || fallback };
}
