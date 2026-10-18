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

export const emojiIcons: EmojiIcon[] = emojiMartData.categories.flatMap((entry) => {
  const category = categoryMap[entry.id];
  if (!category) return [];
  return entry.emojis.flatMap((emojiId) => {
    const emoji = emojiMartData.emojis[emojiId];
    const native = emoji?.skins?.[0]?.native;
    if (!native) return [];
    const name = normalizeName(String(emoji?.name ?? emoji?.id ?? emojiId));
    return [{
      name,
      emoji: native,
      keywords: Array.from(new Set([...keywords(emoji?.keywords), normalizeName(String(emoji?.id ?? emojiId)), name])),
      category,
    }];
  });
}).sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
