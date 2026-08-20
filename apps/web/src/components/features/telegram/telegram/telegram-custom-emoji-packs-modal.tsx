"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { TelegramCustomEmojiPackSummary, TelegramCustomEmojiPackTarget } from "@telegram-system/shared";
import { Button, Input, Modal, MultiSelect, ToggleRow, TooltipBubble } from "@/components/ui/primitives";
import { TelegramCustomEmojiRenderer } from "./telegram-custom-emoji";

type Channel = { id: string; title: string };
type Props = {
  open: boolean; onClose: () => void; currentChannelId: string; channels: Channel[];
  packs: TelegramCustomEmojiPackSummary[];
  onImport: (input: { source: string; scope: "CHANNELS" | "ALL_CHANNELS"; channelIds?: string[] }) => Promise<void> | void;
  onDetach: (packId: string, target: TelegramCustomEmojiPackTarget) => Promise<void> | void;
};

export function TelegramCustomEmojiPacksModal({ open, onClose, currentChannelId, channels, packs, onImport, onDetach }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [allChannels, setAllChannels] = useState(false);
  const [channelIds, setChannelIds] = useState<string[]>([currentChannelId]);
  useEffect(() => { if (open) { setAllChannels(false); setChannelIds([currentChannelId]); } }, [open, currentChannelId]);
  const target = (): TelegramCustomEmojiPackTarget => allChannels ? { scope: "ALL_CHANNELS" } : { scope: "CHANNELS", channelIds };
  const run = async (operation: () => Promise<void> | void) => { setBusy(true); try { await operation(); } finally { setBusy(false); } };
  const hasTargets = allChannels || channelIds.length > 0;
  return <Modal open={open} onClose={onClose} title="Premium Emoji" size="md">
    <div className="space-y-4">
      <div className="space-y-3">
        <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Telegram emoji pack link" />
        <div className="group relative">
          <ToggleRow checked={allChannels} onChange={setAllChannels} activeTone="blue" label="All current workspace channels" description="Make this pack available to every channel that exists now." />
          <TooltipBubble className="invisible group-hover:visible group-focus-within:visible" side="bottom" align="left">When enabled, the pack is attached to every current workspace channel. Turn it off to choose specific channels.</TooltipBubble>
        </div>
        {!allChannels && <MultiSelect value={channelIds} onChange={setChannelIds} options={channels.map((channel) => ({ value: channel.id, label: channel.title }))} placeholder="Select Telegram channels" />}
      </div>
      <Button disabled={!input.trim() || busy || !hasTargets} onClick={() => run(async () => { const nextTarget = target(); await onImport({ source: input.trim(), scope: nextTarget.scope, ...(nextTarget.scope === "CHANNELS" ? { channelIds: nextTarget.channelIds } : {}) }); setInput(""); })}>Add Premium Emoji</Button>
      <div className="space-y-2">
        {packs.map((pack) => <div key={pack.id} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 p-3"><span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-900 text-lg"><TelegramCustomEmojiRenderer emoji={pack.emojis[0] ?? { id: "", documentId: "", alt: "◇", kind: "STATIC", mimeType: null, isFree: true, needsRepainting: false, position: 0, assetUrl: null, renderAssetUrl: null }} className="h-6 w-6" /></span><span className="min-w-0"><span className="block truncate text-sm text-white">{pack.title}</span><span className="text-xs text-neutral-500">{pack.emojis.length} emoji</span></span></span><button type="button" aria-label={`Delete ${pack.title}`} title="Delete pack" disabled={busy || !hasTargets} onClick={() => run(() => onDetach(pack.id, target()))} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={16} /></button></div>)}
        {!packs.length && <p className="py-6 text-center text-sm text-neutral-500">No packs attached to this channel.</p>}
      </div>
    </div>
  </Modal>;
}
