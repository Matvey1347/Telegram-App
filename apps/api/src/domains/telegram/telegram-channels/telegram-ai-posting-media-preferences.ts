import { TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES } from '@telegram-system/shared';

import type { TelegramAiPostingReferences } from './telegram-ai-posting-image-reference';

export type TelegramAiPostingMediaPreference = {
  id: string;
  name: string;
  description: string;
  generationDescription?: string;
  searchDescription?: string;
  emoji: string;
  emojiIconId?: string;
  references: string[];
  purpose: 'SEARCH' | 'GENERATION' | 'BOTH';
};

export function createTelegramAiPostingMediaRunState() {
  return {
    referenceImageCache: new Map<
      string,
      TelegramAiPostingReferences
    >(),
  };
}

export function telegramAiPostingMediaPreferences(
  config: Record<string, unknown>,
): TelegramAiPostingMediaPreference[] {
  if (Array.isArray(config.mediaPreferences)) {
    return config.mediaPreferences.slice(0, 10).flatMap((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return [];
      const item = value as Record<string, unknown>;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name) return [];
      return [
        {
          id:
            typeof item.id === 'string' && item.id ? item.id : `media-${index}`,
          name: name.slice(0, 80),
          description:
            typeof item.description === 'string'
              ? item.description.slice(0, 500)
              : '',
          generationDescription: typeof item.generationDescription === 'string'
            ? item.generationDescription.trim().slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH)
            : undefined,
          searchDescription: typeof item.searchDescription === 'string'
            ? item.searchDescription.trim().slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH)
            : undefined,
          emoji:
            typeof item.emoji === 'string' && item.emoji.trim()
              ? item.emoji.trim().slice(0, 16)
              : '🎨',
          emojiIconId:
            typeof item.emojiIconId === 'string' && item.emojiIconId
              ? item.emojiIconId
              : undefined,
          references: Array.isArray(item.references)
            ? item.references
                .filter((url): url is string => typeof url === 'string')
                .slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES)
            : [],
          purpose: item.purpose === 'SEARCH' || item.purpose === 'GENERATION'
            ? item.purpose
            : 'BOTH',
        },
      ];
    });
  }
  return [];
}

export function resolveTelegramAiPostingMediaPreference(
  config: Record<string, unknown>,
  publication: { imagePrompt: string; mediaPreference?: { id: string } | null },
) {
  const preferences = telegramAiPostingMediaPreferences(config);
  return (
    preferences.find((item) => item.id === publication.mediaPreference?.id) ??
    preferences.find((item) =>
      publication.imagePrompt.includes(`Visual preference: ${item.name}`),
    )
  );
}

export function clearTelegramAiPostingMediaFailure(
  failures: unknown,
  topic: string,
) {
  return Array.isArray(failures)
    ? failures.filter((failure) => {
        if (!failure || typeof failure !== 'object' || Array.isArray(failure))
          return true;
        const entry = failure as { topic?: unknown; code?: unknown };
        return (
          entry.topic !== topic ||
          !(
            typeof entry.code === 'string' &&
            (entry.code.startsWith('AI_POSTING_IMAGE_') ||
              entry.code === 'AI_REQUEST_BUDGET_EXCEEDED')
          )
        );
      })
    : [];
}
