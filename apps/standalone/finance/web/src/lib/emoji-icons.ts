import data from "@emoji-mart/data";

export type EmojiCategory =
  | "people"
  | "nature"
  | "food"
  | "activity"
  | "travel"
  | "objects"
  | "symbols"
  | "flags";

export type EmojiIcon = { name: string; emoji: string; keywords: string[]; category: EmojiCategory };

const categoryMap: Record<string, EmojiCategory> = {
  people: "people", nature: "nature", foods: "food", activity: "activity",
  places: "travel", objects: "objects", symbols: "symbols", flags: "flags",
};

type EmojiMartData = {
  categories: Array<{ id: string; emojis: string[] }>;
  emojis: Record<string, { id?: string; name?: string; keywords?: unknown; skins?: Array<{ native?: string }> }>;
};

function normalizeName(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function keywords(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).toLowerCase()) : [];
}

const emojiMartData = data as EmojiMartData;
const heartSymbols = new Set(["gift_heart", "sparkling_heart", "heartpulse", "heartbeat", "revolving_hearts", "two_hearts", "heart_decoration", "heavy_heart_exclamation_mark_ornament", "broken_heart", "heart_on_fire", "mending_heart", "heart", "pink_heart", "orange_heart", "yellow_heart", "green_heart", "blue_heart", "light_blue_heart", "purple_heart", "brown_heart", "black_heart", "grey_heart", "white_heart", "purple_heart", "cupid"]);

export const emojiIcons: EmojiIcon[] = emojiMartData.categories.flatMap((entry) => {
  const category = categoryMap[entry.id];
  if (!category) return [];
  return entry.emojis.flatMap((emojiId) => {
    const emoji = emojiMartData.emojis[emojiId];
    const natives = emoji?.skins?.map((skin) => skin.native).filter((native): native is string => Boolean(native)) ?? [];
    if (!natives.length) return [];
    const name = normalizeName(String(emoji?.name ?? emoji?.id ?? emojiId));
    return natives.map((native) => ({
      name,
      emoji: native,
      keywords: Array.from(new Set([...keywords(emoji?.keywords), normalizeName(String(emoji?.id ?? emojiId)), name])),
      category: heartSymbols.has(emojiId) ? "symbols" : category,
    }));
  });
});
