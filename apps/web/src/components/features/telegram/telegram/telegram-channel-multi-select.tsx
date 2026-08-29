"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { TelegramChannelSelectOption as TelegramChannel } from "@/lib/api";

export function ChannelMultiSelect({
  channels,
  selectedIds,
  onChange,
}: {
  channels: TelegramChannel[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = new Set(selectedIds);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const toggle = (channelId: string) => {
    onChange(
      selected.has(channelId)
        ? selectedIds.filter((id) => id !== channelId)
        : [...selectedIds, channelId],
    );
  };
  const label = selectedIds.length
    ? `${selectedIds.length} selected`
    : "All channels";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring"
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-2 py-2">
            <span className="truncate px-1 text-xs text-neutral-500">
              Empty = visible in every channel
            </span>
            <div className="flex shrink-0 gap-1 text-xs">
              <button
                type="button"
                onClick={() => onChange(channels.map((channel) => channel.id))}
                className="rounded-md px-2 py-1 text-blue-300 hover:bg-blue-950/50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                All channels
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5">
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => toggle(channel.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-800"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    selected.has(channel.id)
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-neutral-600"
                  }`}
                >
                  {selected.has(channel.id) ? <Check size={11} /> : null}
                </span>
                {channel.photoUrl ? (
                  <span
                    className="h-6 w-6 shrink-0 rounded-md bg-cover bg-center"
                    style={{ backgroundImage: `url(${channel.photoUrl})` }}
                    aria-hidden="true"
                  />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs">
                    {channel.title.trim()[0]?.toUpperCase() || "T"}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {channel.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

