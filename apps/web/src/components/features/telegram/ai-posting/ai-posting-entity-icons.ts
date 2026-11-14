import type { ResolvedEmoji } from "@telegram-system/shared";

export function aiPostingCategoryIcons(
  entries: Array<{ name: string; iconPresentation?: ResolvedEmoji | null }>,
): Record<string, ResolvedEmoji> {
  return Object.fromEntries(entries.flatMap((entry) =>
    entry.iconPresentation ? [[entry.name, entry.iconPresentation]] : [],
  ));
}

export function aiPostingPreferenceIcons(
  preferences: Array<{ id: string; emojiIconId?: string | null; emoji?: string | null }>,
  icons?: Record<string, ResolvedEmoji>,
): Record<string, ResolvedEmoji> {
  return Object.fromEntries(preferences.map((preference) => [
    preference.id,
    (preference.emojiIconId && icons?.[preference.emojiIconId]) || {
      type: "unicode", value: preference.emoji || "🎨",
    },
  ]));
}
