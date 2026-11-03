"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { telegramChannelsApi } from "@/lib/api";
import { emojiIcons } from "@/lib/emoji-icons";
import { workspaceKeys } from "@/lib/query-keys";
import { customEmojiToken, TelegramCustomEmojiRenderer } from "@/components/features/telegram/telegram/telegram-custom-emoji";

/** Embedded in the composer, so choosing an emoji never discards the draft. */
export function CrmEmojiPanel({ onInsert, onClose }: { onInsert: (text: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"standard" | "premium">("standard");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const packs = useQuery({ queryKey: workspaceKeys.telegramCustomEmojiPacks(), queryFn: () => telegramChannelsApi.customEmojiPacks(), enabled: tab === "premium" });
  const standard = useMemo(() => emojiIcons.filter((item) => !query || item.name.toLowerCase().includes(query) || item.emoji.includes(query)).slice(0, 160), [query]);
  const matchingPacks = (packs.data?.packs ?? []).map((pack) => ({ ...pack, emojis: pack.emojis.filter((emoji) => !query || emoji.alt.toLowerCase().includes(query)) })).filter((pack) => pack.emojis.length);
  return <section aria-label="Emoji picker" className="mt-1 rounded-xl border border-neutral-700 bg-neutral-900 p-2" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <div className="flex items-center gap-1 border-b border-neutral-800 pb-1" role="group" aria-label="Emoji categories">
      {(["standard", "premium"] as const).map((item) => <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)} className={`min-h-10 rounded-md px-3 text-sm ${tab === item ? "bg-neutral-700 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}>{item === "standard" ? "Emoji" : "Premium"}</button>)}
      <button type="button" aria-label="Close emoji picker" onClick={onClose} className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800"><X size={18} /></button>
    </div>
    <input type="search" aria-label="Search emoji" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search emoji" className="mt-2 h-10 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-sm text-white outline-none focus:border-blue-500" />
    <div className="mt-2 h-52 overflow-y-auto overscroll-contain" aria-live="polite">
      {tab === "standard" ? <div className="grid grid-cols-7 gap-1 sm:grid-cols-8">{standard.map((item) => <button key={`${item.emoji}-${item.name}`} type="button" aria-label={`Insert ${item.name}`} title={item.name} onMouseDown={(event) => event.preventDefault()} onClick={() => onInsert(item.emoji)} className="inline-flex min-h-10 items-center justify-center rounded-md text-xl hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">{item.emoji}</button>)}</div> : packs.isLoading ? <p role="status" className="p-3 text-sm text-neutral-400">Loading Premium emoji…</p> : packs.isError ? <div role="alert" className="p-3 text-sm text-rose-300">Could not load Premium emoji. <button type="button" onClick={() => void packs.refetch()} className="text-blue-300 underline">Retry</button></div> : matchingPacks.length ? matchingPacks.map((pack) => <section key={pack.id}><p className="px-1 py-2 text-xs text-neutral-400">{pack.title}</p><div className="grid grid-cols-7 gap-1 sm:grid-cols-8">{pack.emojis.map((emoji) => <button key={emoji.documentId} type="button" aria-label={`Insert ${emoji.alt || "Premium emoji"}`} onMouseDown={(event) => event.preventDefault()} onClick={() => onInsert(customEmojiToken(emoji))} className="inline-flex min-h-10 items-center justify-center rounded-md hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"><TelegramCustomEmojiRenderer emoji={emoji} /></button>)}</div></section>) : <p className="p-3 text-sm text-neutral-400">No matching Premium emoji.</p>}
      {tab === "standard" && !standard.length ? <p className="p-3 text-sm text-neutral-400">No matching emoji.</p> : null}
    </div>
  </section>;
}
