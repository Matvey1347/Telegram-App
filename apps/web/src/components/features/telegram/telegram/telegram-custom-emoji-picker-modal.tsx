"use client";


import { Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { TelegramCustomEmoji, TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import { emojiIcons } from "@/lib/emoji-icons";
import { Button, Input, Modal } from "@/components/ui/primitives";
import { TelegramCustomEmojiRenderer } from "./telegram-custom-emoji";
import { useI18n } from "@/providers/i18n-provider";

type Props = { open: boolean; onClose: () => void; packs: TelegramCustomEmojiPackSummary[]; onSelect: (emoji: TelegramCustomEmoji) => void; onSelectStandard: (emoji: string) => void; onManage?: () => void };
export function TelegramCustomEmojiPickerModal({ open, onClose, packs, onSelect, onSelectStandard, onManage }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"STANDARD" | "PREMIUM">("STANDARD");
  const [search, setSearch] = useState(""); const query = search.trim().toLowerCase();
  const standard = useMemo(() => emojiIcons.filter((item) => !query || item.name.toLowerCase().includes(query) || item.emoji.includes(query)).slice(0, 160), [query]);
  const matchingPacks = packs.map((pack) => ({ pack, emojis: pack.emojis.filter((emoji) => !query || emoji.alt.toLowerCase().includes(query)) })).filter(({ emojis }) => emojis.length);
  return <Modal open={open} onClose={onClose} title={t("telegram.posts.editorComponents.emojiPicker.title")} size="md"><div className="space-y-3">
    <div className="flex gap-2 border-b border-neutral-800"><button type="button" aria-pressed={tab === "STANDARD"} onClick={() => setTab("STANDARD")} className={`px-2 pb-2 text-sm ${tab === "STANDARD" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"}`}>{t("telegram.posts.editorComponents.emojiPicker.standard")}</button><button type="button" aria-pressed={tab === "PREMIUM"} onClick={() => setTab("PREMIUM")} className={`px-2 pb-2 text-sm ${tab === "PREMIUM" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"}`}>{t("telegram.posts.editorComponents.emojiPicker.premium")}</button></div>
    <div className="flex gap-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("telegram.posts.editorComponents.emojiPicker.search")} />{tab === "PREMIUM" && <Button type="button" variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => { onClose(); onManage?.(); }} aria-label={t("telegram.posts.editorComponents.emojiPicker.managePremium")} title={t("telegram.posts.editorComponents.emojiPicker.managePremium")}><Settings2 size={16} /> <span>{t("telegram.posts.editorComponents.emojiPicker.manage")}</span></Button>}</div>
    <div className="max-h-80 overflow-y-auto">{tab === "STANDARD" ? <div className="flex flex-wrap gap-1">{standard.map((item) => <button key={`${item.emoji}-${item.name}`} type="button" aria-label={t("telegram.posts.editorComponents.emojiPicker.insert")} title={t("telegram.posts.editorComponents.emojiPicker.insert")} onClick={() => onSelectStandard(item.emoji)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-neutral-800">{item.emoji}</button>)}</div> : <div className="space-y-3">{matchingPacks.map(({ pack, emojis }) => <section key={pack.id}><p className="mb-1 text-xs font-medium text-neutral-400">{pack.title}</p><div className="flex flex-wrap gap-1">{emojis.map((emoji) => <button key={emoji.documentId} type="button" aria-label={t("telegram.posts.editorComponents.emojiPicker.insertNamed", { name: emoji.alt || t("telegram.posts.editorComponents.customEmoji.label") })} title={emoji.alt} onClick={() => onSelect(emoji)} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-neutral-800"><TelegramCustomEmojiRenderer emoji={emoji} /></button>)}</div></section>)}{!matchingPacks.length && <p className="py-6 text-center text-sm text-neutral-500">{t("telegram.posts.editorComponents.emojiPicker.emptyPremium")}</p>}</div>}</div>
  </div></Modal>;
}
