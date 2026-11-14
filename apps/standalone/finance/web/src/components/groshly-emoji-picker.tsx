"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { emojiIcons, type EmojiCategory } from "@finance-web/lib/emoji-icons";
import { emojiSearchKey, loadEmojiSearch, normalizeEmojiSearch } from "@finance-web/lib/emoji-search";

const groups: Array<{ id: EmojiCategory; icon: string; uk: string; en: string }> = [
  { id: "people", icon: "😀", uk: "Люди", en: "People" },
  { id: "nature", icon: "🌿", uk: "Природа", en: "Nature" },
  { id: "food", icon: "🍎", uk: "Їжа", en: "Food" },
  { id: "activity", icon: "⚽", uk: "Дозвілля", en: "Activities" },
  { id: "travel", icon: "🚗", uk: "Подорожі", en: "Travel" },
  { id: "objects", icon: "💡", uk: "Предмети", en: "Objects" },
  { id: "symbols", icon: "❤️", uk: "Символи", en: "Symbols" },
  { id: "flags", icon: "🏳️", uk: "Прапори", en: "Flags" },
];
const emptyIndexes: Record<string, string>[] = [];

export function GroshlyEmojiPicker({ value, onPick, t }: {
  value: string;
  onPick: (emoji: string) => void;
  t: (uk: string, en: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EmojiCategory>("people");
  const [result, setResult] = useState<{ query: string; indexes: Record<string, string>[]; error: boolean }>({ query: "", indexes: emptyIndexes, error: false });
  const list = useRef<HTMLDivElement | null>(null);
  const search = normalizeEmojiSearch(query);
  const indexes = result.query === search ? result.indexes : emptyIndexes;
  const loading = Boolean(search) && result.query !== search;
  const searchError = result.query === search && result.error;
  useEffect(() => {
    let active = true;
    if (!search) return;
    const timer = window.setTimeout(() => {
      void loadEmojiSearch(search).then((data) => { if (active) setResult({ query: search, indexes: data, error: false }); })
        .catch(() => { if (active) setResult({ query: search, indexes: emptyIndexes, error: true }); });
    }, 100);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);
  const matches = useMemo(() => {
    const words = search.split(/\s+/u).filter(Boolean);
    return emojiIcons.filter((item) => {
      if (!search) return item.category === category;
      const key = emojiSearchKey(item.emoji);
      const modifiers = Array.from(item.emoji).filter((char) => /[\u{1F3FB}-\u{1F3FF}]/u.test(char));
      const haystack = normalizeEmojiSearch([key, item.name, ...item.keywords, ...indexes.flatMap((index) => [index[key] || "", ...modifiers.map((modifier) => index[modifier] || "")])].join(" "));
      return words.every((word) => haystack.includes(word));
    });
  }, [search, indexes, category]);
  const heartTerms = normalizeEmojiSearch(["heart", ...indexes.map((index) => index["❤"] || "")].join(" "));
  const heartSearch = Boolean(search) && search.split(/\s+/u).every((word) => heartTerms.includes(word));
  const visibleGroups = heartSearch ? [...groups.filter((group) => group.id === "symbols"), ...groups.filter((group) => group.id !== "symbols")] : groups;
  return <div className="emoji-picker">
    <div className="emoji-search"><Search size={16} aria-hidden="true"/><input aria-label={t("Пошук емодзі", "Search emojis")} value={query} placeholder={t("Пошук емодзі", "Search emojis")} onChange={(event) => setQuery(event.target.value)}/></div>
    <div className="emoji-categories" role="group" aria-label={t("Категорії емодзі", "Emoji categories")}>{groups.map((group) => <button type="button" key={group.id} aria-label={t(group.uk, group.en)} aria-pressed={!query && category === group.id} onClick={() => { setQuery(""); setCategory(group.id); if (list.current) list.current.scrollTop = 0; }}>{group.icon}</button>)}</div>
    {loading && <p className="emoji-search-status" role="status">{t("Шукаємо емодзі…", "Searching emojis…")}</p>}
    {searchError && <p className="emoji-search-status" role="status">{t("Не вдалося завантажити переклади. Спробуй ще раз.", "Could not load translations. Try again.")}</p>}
    <div className="emoji-sections" ref={list}>{visibleGroups.map((group) => {
      const items = matches.filter((item) => item.category === group.id);
      if (!items.length) return null;
      return <section className="emoji-section" key={group.id} aria-label={t(group.uk, group.en)}><h3>{t(group.uk, group.en)}</h3><div className="emoji-grid">{items.map((item) => <button type="button" key={item.category + item.name + item.emoji} aria-label={`${item.name} ${item.emoji}`} className={value === item.emoji ? "chosen" : ""} onClick={() => onPick(item.emoji)}>{item.emoji}</button>)}</div></section>;
    })}
    {!matches.length && !loading && <p className="muted">{t("Емодзі не знайдено", "No emoji found")}</p>}</div>
  </div>;
}
