"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { emojiIcons, type EmojiCategory } from "@finance-web/lib/emoji-icons";

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
const pageSize = 120;
const extraKeywords: Record<string, string> = {
  "💳": "картка банк карта", "💵": "гроші готівка деньги", "📈": "інвестиція графік инвестиции",
  "🏦": "банк", "💼": "робота работа", "💰": "гроші деньги", "🎁": "подарунок подарок",
  "🛒": "покупки продукти продукты", "☕": "кава кофе", "🏠": "дім дом", "🤝": "борг долг",
};

export function GroshlyEmojiPicker({ value, onPick, t }: {
  value: string;
  onPick: (emoji: string) => void;
  t: (uk: string, en: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<EmojiCategory>("people");
  const [limit, setLimit] = useState(pageSize);
  const matches = useMemo(() => {
    const search = query.trim().toLocaleLowerCase().replace(/\uFE0F/gu, "");
    return emojiIcons.filter((item) => search
      ? [item.emoji.replace(/\uFE0F/gu, ""), item.name, ...item.keywords, extraKeywords[item.emoji] || ""].some((term) => term.toLocaleLowerCase().includes(search))
      : item.category === category);
  }, [category, query]);
  return <div className="emoji-picker">
    <div className="emoji-search"><Search size={16} aria-hidden="true"/><input aria-label={t("Пошук емодзі", "Search emojis")} value={query} placeholder={t("Пошук емодзі", "Search emojis")} onChange={(event) => { setQuery(event.target.value); setLimit(pageSize); }}/></div>
    <div className="emoji-categories" role="group" aria-label={t("Категорії емодзі", "Emoji categories")}>{groups.map((group) => <button type="button" key={group.id} aria-label={t(group.uk, group.en)} aria-pressed={!query && category === group.id} onClick={() => { setQuery(""); setCategory(group.id); setLimit(pageSize); }}>{group.icon}</button>)}</div>
    {matches.length ? <div className="emoji-grid">{matches.slice(0, limit).map((item) => <button type="button" key={item.category + item.name + item.emoji} aria-label={`${item.name} ${item.emoji}`} className={value === item.emoji ? "chosen" : ""} onClick={() => onPick(item.emoji)}>{item.emoji}</button>)}</div> : <p className="muted">{t("Емодзі не знайдено", "No emoji found")}</p>}
    {limit < matches.length && <button type="button" className="emoji-more" onClick={() => setLimit((current) => current + pageSize)}>{t("Показати ще", "Show more")}</button>}
  </div>;
}
