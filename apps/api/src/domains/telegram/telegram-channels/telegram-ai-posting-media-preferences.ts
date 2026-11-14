import { TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES } from '@telegram-system/shared';

export type TelegramAiPostingMediaPreference = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  references: string[];
};

export function createTelegramAiPostingMediaRunState(
  config: Record<string, unknown>,
) {
  return {
    hasConfiguredPreferences:
      (Array.isArray(config.mediaPreferences) &&
        config.mediaPreferences.length > 0) ||
      (Array.isArray(config.imageStyles) && config.imageStyles.length > 0),
    referenceImageCache: new Map<
      string,
      { image: Buffer | null; failed: boolean }
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
          emoji:
            typeof item.emoji === 'string' && item.emoji.trim()
              ? item.emoji.trim().slice(0, 16)
              : '🎨',
          references: Array.isArray(item.references)
            ? item.references
                .filter((url): url is string => typeof url === 'string')
                .slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES)
            : [],
        },
      ];
    });
  }
  const styles = Array.isArray(config.imageStyles)
    ? config.imageStyles
        .filter(
          (value): value is string =>
            typeof value === 'string' && Boolean(value.trim()),
        )
        .slice(0, 10)
    : [];
  const references = Array.isArray(config.imageReferenceUrls)
    ? config.imageReferenceUrls
        .filter((value): value is string => typeof value === 'string')
        .slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES)
    : [];
  return styles.map((style, index) => ({
    id: `legacy-${index}`,
    name: style.slice(0, 80),
    description: '',
    emoji: '🎨',
    references,
  }));
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
