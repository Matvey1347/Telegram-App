/** CLDR 49 annotation indexes are loaded only when searching. */
type EmojiIndex = Record<string, string>;
type Script = "latin" | "cyrillic" | "cjk" | "arabic" | "other";
const loaded = new Map<Script, Promise<EmojiIndex>>();
export const normalizeEmojiSearch = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/\uFE0F/gu, "").trim();
export const emojiSearchKey = (emoji: string) => emoji.replace(/[\uFE0F\u{1F3FB}-\u{1F3FF}]/gu, "");

function scriptFor(char: string): Script | null {
  if (/\p{Script=Latin}/u.test(char)) return "latin";
  if (/\p{Script=Cyrillic}/u.test(char)) return "cyrillic";
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)) return "cjk";
  if (/\p{Script=Arabic}/u.test(char)) return "arabic";
  return /\p{L}/u.test(char) ? "other" : null;
}

export function loadEmojiSearch(query: string): Promise<EmojiIndex[]> {
  const scripts = [...new Set(Array.from(normalizeEmojiSearch(query), scriptFor).filter((item): item is Script => item !== null))];
  return Promise.all(scripts.map((script) => {
    let result = loaded.get(script);
    if (!result) {
      result = fetch(`/emoji-search/${script}.json`).then((response) => {
        if (!response.ok) throw new Error("Emoji search index unavailable");
        return response.json() as Promise<EmojiIndex>;
      }).catch((error) => { loaded.delete(script); throw error; });
      loaded.set(script, result);
    }
    return result;
  }));
}
