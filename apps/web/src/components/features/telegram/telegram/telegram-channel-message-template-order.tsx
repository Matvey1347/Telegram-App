"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { TelegramMessageTemplateChannelSource } from "@telegram-system/shared";
import { Input } from "@/components/ui/primitives";

export function TelegramChannelMessageTemplateOrder({
  channels,
  groupChannels,
  groupLabels,
  onOrderChange,
  onGroupChannelsChange,
  onGroupLabelsChange,
}: {
  channels: TelegramMessageTemplateChannelSource[];
  groupChannels: boolean;
  groupLabels: Record<string, string>;
  onOrderChange: (ids: string[]) => void;
  onGroupChannelsChange: (enabled: boolean) => void;
  onGroupLabelsChange: (labels: Record<string, string>) => void;
}) {
  const move = (index: number, direction: -1 | 1) => {
    const ids = channels.map((channel) => channel.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    onOrderChange(ids);
  };

  return (
    <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
      <div>
        <h3 className="text-sm font-medium text-white">Channel order</h3>
        <p className="text-xs text-neutral-400">Move channels into the order you want in the message.</p>
      </div>
      <ol className="space-y-1.5">
        {channels.map((channel, index) => (
          <li key={channel.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{channel.emojiSource} {channel.title}</span>
            {groupChannels ? (
              <Input
                aria-label={`Group for ${channel.title}`}
                className="w-36"
                maxLength={80}
                placeholder="Group, e.g. Business"
                value={groupLabels[channel.id] || ""}
                onChange={(event) => onGroupLabelsChange({ ...groupLabels, [channel.id]: event.target.value })}
              />
            ) : null}
            <button type="button" aria-label={`Move ${channel.title} up`} title="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="inline-flex size-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-35"><ArrowUp size={16} aria-hidden="true" /></button>
            <button type="button" aria-label={`Move ${channel.title} down`} title="Move down" disabled={index === channels.length - 1} onClick={() => move(index, 1)} className="inline-flex size-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-35"><ArrowDown size={16} aria-hidden="true" /></button>
          </li>
        ))}
      </ol>
      <label className="flex cursor-pointer items-start gap-2 text-sm text-neutral-200">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-500" checked={groupChannels} onChange={(event) => onGroupChannelsChange(event.target.checked)} />
        <span>Group channels by topic <span className="block text-xs text-neutral-400">Channels with the same group name appear together under a heading with their count.</span></span>
      </label>
    </section>
  );
}
