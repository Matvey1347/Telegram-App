export type AiPostingLength = {
  id: string;
  name: string;
  emoji: string;
  minCharacters: number;
  maxCharacters: number | null;
};

export type AiPostingSphere = {
  id: string;
  name: string;
  emoji: string;
  tier: "PRIMARY" | "SECONDARY";
  parentId: string | null;
  description: string;
  sources: string[];
  mediaPreferenceId: string | null;
};

export type AiPostingRubric = {
  id: string;
  sphereId: string | null;
  name: string;
  emoji: string;
  description: string;
  goal: string;
  lengthIds: string[];
};

export const DEFAULT_AI_POSTING_LENGTHS: AiPostingLength[] = [
  { id: "ultra-short", name: "Ультракороткая", emoji: "⚡", minCharacters: 0, maxCharacters: 99 },
  { id: "short", name: "Короткая", emoji: "📝", minCharacters: 100, maxCharacters: 299 },
  { id: "medium", name: "Средняя", emoji: "📖", minCharacters: 300, maxCharacters: 699 },
  { id: "long", name: "Длинная", emoji: "📚", minCharacters: 700, maxCharacters: null },
];
