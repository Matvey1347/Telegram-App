import { TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH, TELEGRAM_AI_POSTING_MAX_MEDIA_PREFERENCES, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES } from "@telegram-system/shared";

export type AiPostingMediaPreference = {
  id: string;
  name: string;
  description: string;
  generationDescription?: string;
  searchDescription?: string;
  emoji: string;
  emojiIconId?: string;
  references: string[];
  purpose?: "SEARCH" | "GENERATION" | "BOTH";
};

export function normalizeAiPostingMediaPreferences(config: {
  mediaPreferences?: unknown;
}): AiPostingMediaPreference[] {
  const validReferences = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES)
      : [];

  if (Array.isArray(config.mediaPreferences)) {
    return config.mediaPreferences.slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_PREFERENCES).flatMap((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        return [];
      const item = value as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      return [
        {
          id:
            typeof item.id === "string" && item.id ? item.id : `media-${index}`,
          name: name.slice(0, 80),
          description:
            typeof item.description === "string"
              ? item.description.slice(0, 500)
              : "",
          generationDescription: typeof item.generationDescription === "string"
            ? item.generationDescription.trim().slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH)
            : undefined,
          searchDescription: typeof item.searchDescription === "string"
            ? item.searchDescription.trim().slice(0, TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH)
            : undefined,
          emoji:
            typeof item.emoji === "string" && item.emoji.trim()
              ? item.emoji.trim().slice(0, 16)
              : "🎨",
          emojiIconId:
            typeof item.emojiIconId === "string" && item.emojiIconId
              ? item.emojiIconId
              : undefined,
          references: validReferences(item.references),
          purpose: item.purpose === "SEARCH" || item.purpose === "GENERATION" ? item.purpose : "BOTH",
        },
      ];
    });
  }

  return [];
}

export function appendAiPostingImageFeedback(
  config: Parameters<typeof normalizeAiPostingMediaPreferences>[0],
  value: string,
): AiPostingMediaPreference[] | null {
  const rule = value.trim().slice(0, 500);
  const preferences = normalizeAiPostingMediaPreferences(config);
  if (
    !rule ||
    preferences.some((item) =>
      item.description.toLocaleLowerCase().includes(rule.toLocaleLowerCase()),
    )
  )
    return null;
  if (preferences.length >= 10) throw new Error("AI_POSTING_IMAGE_RULE_LIMIT");
  return [
    ...preferences,
    {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `feedback-${Date.now()}`,
      name: "Пожелание по медиа",
      description: rule,
      emoji: "✨",
      references: [],
      purpose: "BOTH",
    },
  ];
}
