import { DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT } from '@telegram-system/shared';

export function telegramAiPostingHybridMediaMode(
  publicationOrdinal: number,
  searchPercent = DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT,
): 'found' | 'ai' {
  const searchSlots = (count: number) =>
    Math.round((count * searchPercent) / 100);
  return searchSlots(publicationOrdinal + 1) > searchSlots(publicationOrdinal)
    ? 'found'
    : 'ai';
}
