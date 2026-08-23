"use client";

import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { getChannelOptionLabel } from "@/lib/features/growth/telegram-ad-sales";
import {
  CustomSelect,
  DateRangeInput,
  FormField,
  MultiSelect,
} from "@/components/ui/primitives";

export function AdSalePlacementScope({
  mode,
  selectedNetworkId,
  selectedChannelIds,
  dateRange,
  networks,
  channels,
  onModeChange,
  onNetworkChange,
  onChannelsChange,
  onDateRangeChange,
}: {
  mode: "network" | "channels";
  selectedNetworkId: string;
  selectedChannelIds: string[];
  dateRange: { from: string; to: string };
  networks: TelegramChannelNetwork[];
  channels: TelegramChannel[];
  onModeChange: (mode: "network" | "channels") => void;
  onNetworkChange: (networkId: string) => void;
  onChannelsChange: (channelIds: string[]) => void;
  onDateRangeChange: (range: { from: string; to: string }) => void;
}) {
  return (
    <section className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)] xl:items-end">
      <FormField label="Placement source">
        <div className="flex min-w-0 items-center gap-2">
          <div className="inline-grid shrink-0 grid-cols-2 rounded-lg border border-neutral-700 bg-neutral-950 p-0.5">
            {(["network", "channels"] as const).map((option) => {
              const selected = mode === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onModeChange(option)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    selected
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  {option === "network" ? "Network" : "Channels"}
                </button>
              );
            })}
          </div>
          {mode === "network" ? (
            <CustomSelect
              value={selectedNetworkId}
              onChange={onNetworkChange}
              placeholder="Choose network"
              options={networks.map((network) => ({
                value: network.id,
                label: network.name,
                iconUrl:
                  network.iconPresentation?.type === "image"
                    ? network.iconPresentation.url
                    : undefined,
                iconEmoji:
                  network.iconPresentation?.type === "unicode"
                    ? network.iconPresentation.value
                    : undefined,
                iconFallback: network.name,
              }))}
            />
          ) : (
            <MultiSelect
              value={selectedChannelIds}
              onChange={onChannelsChange}
              placeholder="Choose channels"
              options={channels.map((channel) => ({
                value: channel.id,
                label: getChannelOptionLabel(channel),
                selectedLabel: channel.title,
                iconUrl: channel.photoUrl,
                iconFallback: channel.title,
              }))}
            />
          )}
        </div>
      </FormField>
      <FormField label="Placement dates">
        <DateRangeInput
          from={dateRange.from}
          to={dateRange.to}
          onChange={onDateRangeChange}
          className="w-full"
        />
      </FormField>
    </section>
  );
}
