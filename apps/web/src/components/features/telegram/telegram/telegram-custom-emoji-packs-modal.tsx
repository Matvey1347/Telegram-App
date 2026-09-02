"use client";


import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { TelegramCustomEmojiPackSummary, TelegramCustomEmojiPackTarget } from "@telegram-system/shared";
import { Button, Input, Modal, MultiSelect, ToggleRow, TooltipBubble } from "@/components/ui/primitives";
import { TelegramCustomEmojiRenderer } from "./telegram-custom-emoji";
import { useI18n } from "@/providers/i18n-provider";

type Channel = { id: string; title: string };
type Props = {
  open: boolean; onClose: () => void; currentChannelId: string; channels: Channel[];
  packs: TelegramCustomEmojiPackSummary[];
  onImport: (input: { source: string; scope: "CHANNELS" | "ALL_CHANNELS"; channelIds?: string[] }) => Promise<void> | void;
  onDetach: (packId: string, target: TelegramCustomEmojiPackTarget) => Promise<void> | void;
};

export function TelegramCustomEmojiPacksModal({ open, onClose, currentChannelId, channels, packs, onImport, onDetach }: Props) {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [allChannels, setAllChannels] = useState(false);
  const [channelIds, setChannelIds] = useState<string[]>([currentChannelId]);
  useEffect(() => { if (open) { setAllChannels(false); setChannelIds([currentChannelId]); } }, [open, currentChannelId]);
  const target = (): TelegramCustomEmojiPackTarget => allChannels ? { scope: "ALL_CHANNELS" } : { scope: "CHANNELS", channelIds };
  const run = async (operation: () => Promise<void> | void) => { setBusy(true); try { await operation(); } finally { setBusy(false); } };
  const hasTargets = allChannels || channelIds.length > 0;
  return <Modal open={open} onClose={onClose} title={t("telegram.posts.editorComponents.emojiPacks.title")} size="md">
    <div className="space-y-4">
      <div className="space-y-3">
        <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder={t("telegram.posts.editorComponents.emojiPacks.linkPlaceholder")} />
        <div className="group relative">
          <ToggleRow checked={allChannels} onChange={setAllChannels} activeTone="blue" label={t("telegram.posts.editorComponents.emojiPacks.allChannels")} description={t("telegram.posts.editorComponents.emojiPacks.allChannelsDescription")} />
          <TooltipBubble className="invisible group-hover:visible group-focus-within:visible" side="bottom" align="left">{t("telegram.posts.editorComponents.emojiPacks.allChannelsHelp")}</TooltipBubble>
        </div>
        {!allChannels && <MultiSelect value={channelIds} onChange={setChannelIds} options={channels.map((channel) => ({ value: channel.id, label: channel.title }))} placeholder={t("telegram.posts.editorComponents.emojiPacks.selectChannels")} />}
      </div>
      <Button disabled={!input.trim() || busy || !hasTargets} onClick={() => run(async () => { const nextTarget = target(); await onImport({ source: input.trim(), scope: nextTarget.scope, ...(nextTarget.scope === "CHANNELS" ? { channelIds: nextTarget.channelIds } : {}) }); setInput(""); })}>{t("telegram.posts.editorComponents.emojiPacks.add")}</Button>
      <div className="space-y-2">
        {packs.map((pack) => <div key={pack.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 p-3"><span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-lg"><TelegramCustomEmojiRenderer emoji={pack.emojis[0] ?? { id: "", documentId: "", alt: "◇", kind: "STATIC", mimeType: null, isFree: true, needsRepainting: false, position: 0, assetUrl: null, renderAssetUrl: null }} className="h-6 w-6" /></span><span className="min-w-0"><span className="block truncate text-sm text-white">{pack.title}</span><span className="text-xs text-neutral-500">{t("telegram.posts.editorComponents.emojiPacks.emojiCount", { count: pack.emojis.length })}</span></span></span><button type="button" aria-label={t("telegram.posts.editorComponents.emojiPacks.deleteNamed", { name: pack.title })} title={t("telegram.posts.editorComponents.emojiPacks.delete")} disabled={busy || !hasTargets} onClick={() => run(() => onDetach(pack.id, target()))} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={16} /></button></div>)}
        {!packs.length && <p className="py-6 text-center text-sm text-neutral-500">{t("telegram.posts.editorComponents.emojiPacks.empty")}</p>}
      </div>
    </div>
  </Modal>;
}
