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
                .slice(0, 4)
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
        .slice(0, 4)
    : [];
  return styles.map((style, index) => ({
    id: `legacy-${index}`,
    name: style.slice(0, 80),
    description: '',
    emoji: '🎨',
    references,
  }));
}
