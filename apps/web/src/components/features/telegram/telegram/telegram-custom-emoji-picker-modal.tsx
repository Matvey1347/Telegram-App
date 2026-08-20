"use client";

import { Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { TelegramCustomEmoji, TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import { emojiIcons } from "@/lib/emoji-icons";
import { Button, Input, Modal } from "@/components/ui/primitives";
import { TelegramCustomEmojiRenderer } from "./telegram-custom-emoji";

type Props = { open: boolean; onClose: () => void; packs: TelegramCustomEmojiPackSummary[]; onSelect: (emoji: TelegramCustomEmoji) => void; onSelectStandard: (emoji: string) => void; onManage?: () => void };
export function TelegramCustomEmojiPickerModal({ open, onClose, packs, onSelect, onSelectStandard, onManage }: Props) {
  const [tab, setTab] = useState<"STANDARD" | "PREMIUM">("STANDARD");
  const [search, setSearch] = useState(""); const query = search.trim().toLowerCase();
  const standard = useMemo(() => emojiIcons.filter((item) => !query || item.name.toLowerCase().includes(query) || item.emoji.includes(query)).slice(0, 160), [query]);
  const matchingPacks = packs.map((pack) => ({ pack, emojis: pack.emojis.filter((emoji) => !query || emoji.alt.toLowerCase().includes(query)) })).filter(({ emojis }) => emojis.length);
  return <Modal open={open} onClose={onClose} title="Emoji" size="md"><div className="space-y-3">
    <div className="flex gap-2 border-b border-neutral-800"><button type="button" aria-pressed={tab === "STANDARD"} onClick={() => setTab("STANDARD")} className={`px-2 pb-2 text-sm ${tab === "STANDARD" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"}`}>Standard</button><button type="button" aria-pressed={tab === "PREMIUM"} onClick={() => setTab("PREMIUM")} className={`px-2 pb-2 text-sm ${tab === "PREMIUM" ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"}`}>Premium</button></div>
    <div className="flex gap-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search emoji…" />{tab === "PREMIUM" && <Button type="button" variant="secondary" className="shrink-0 whitespace-nowrap" onClick={() => { onClose(); onManage?.(); }} aria-label="Manage Premium Emoji" title="Manage Premium Emoji"><Settings2 size={16} /> <span>Manage</span></Button>}</div>
    <div className="max-h-80 overflow-y-auto">{tab === "STANDARD" ? <div className="flex flex-wrap gap-1">{standard.map((item) => <button key={`${item.emoji}-${item.name}`} type="button" aria-label={`Insert ${item.name}`} title={item.name} onClick={() => onSelectStandard(item.emoji)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-neutral-800">{item.emoji}</button>)}</div> : <div className="space-y-3">{matchingPacks.map(({ pack, emojis }) => <section key={pack.id}><p className="mb-1 text-xs font-medium text-neutral-400">{pack.title}</p><div className="flex flex-wrap gap-1">{emojis.map((emoji) => <button key={emoji.documentId} type="button" aria-label={`Insert ${emoji.alt || "custom emoji"}`} title={emoji.alt} onClick={() => onSelect(emoji)} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-neutral-800"><TelegramCustomEmojiRenderer emoji={emoji} /></button>)}</div></section>)}{!matchingPacks.length && <p className="py-6 text-center text-sm text-neutral-500">No Premium emoji available for this channel.</p>}</div>}</div>
  </div></Modal>;
}
