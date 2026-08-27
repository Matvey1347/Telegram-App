"use client";

import type { ReactNode } from "react";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { getChannelOptionLabel } from "@/lib/features/growth/telegram-ad-sales";
import {
  CustomSelect,
  DateRangeInput,
  MultiSelect,
  Select,
  TimeInput,
} from "@/components/ui/primitives";

export type AdSaleScopeMode = "network" | "channels";

export function AdSaleScopeModeToggle({
  mode,
  onChange,
}: {
  mode: AdSaleScopeMode;
  onChange: (mode: AdSaleScopeMode) => void;
}) {
  return (
    <div className="inline-grid shrink-0 grid-cols-2 rounded-md border border-neutral-700 bg-neutral-950 p-px">
      {(["network", "channels"] as const).map((option) => {
        const selected = mode === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={`h-6 rounded-[5px] px-2 text-[11px] font-medium leading-none transition ${
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
  );
}

export function AdSalePlacementScope({
  mode,
  selectedNetworkId,
  selectedChannelIds,
  dateRange,
  commonTime,
  commonFormatName,
  commonFormats,
  networks,
  channels,
  networkPricing,
  onModeChange,
  onNetworkChange,
  onChannelsChange,
  onDateRangeChange,
  onCommonTimeChange,
  onCommonFormatChange,
}: {
  mode: AdSaleScopeMode;
  selectedNetworkId: string;
  selectedChannelIds: string[];
  dateRange: { from: string; to: string };
  commonTime: string;
  commonFormatName: string;
  commonFormats: Array<{ id: string; name: string }>;
  networks: TelegramChannelNetwork[];
  channels: TelegramChannel[];
  networkPricing?: ReactNode;
  onModeChange: (mode: AdSaleScopeMode) => void;
  onNetworkChange: (networkId: string) => void;
  onChannelsChange: (channelIds: string[]) => void;
  onDateRangeChange: (range: { from: string; to: string }) => void;
  onCommonTimeChange: (time: string) => void;
  onCommonFormatChange: (formatName: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_minmax(220px,1fr)_160px_minmax(190px,0.8fr)] xl:items-start">
        <div className="min-w-0 space-y-1 text-sm">
          <div className="flex h-7 items-center gap-2">
            <span className="text-sm text-neutral-300">Placement source</span>
            <AdSaleScopeModeToggle mode={mode} onChange={onModeChange} />
          </div>
          <div className="[&>div>button]:h-[42px] [&>div>button]:min-h-0">
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
        </div>
        <div className="space-y-1">
          <div className="flex h-7 items-center text-sm text-neutral-300">
            Placement dates
          </div>
          <DateRangeInput
            from={dateRange.from}
            to={dateRange.to}
            onChange={onDateRangeChange}
            className="w-full [&>button]:h-[42px]"
          />
        </div>
        <label className="space-y-1">
          <span className="flex h-7 items-center text-sm text-neutral-300">
            Time for all
          </span>
          <TimeInput
            value={commonTime}
            onChange={(event) => onCommonTimeChange(event.target.value)}
            className="h-[42px]"
          />
        </label>
        <label className="space-y-1">
          <span className="flex h-7 items-center text-sm text-neutral-300">
            Format for all
          </span>
          <Select
            value={commonFormatName}
            onChange={(event) => onCommonFormatChange(event.target.value)}
            className="h-[42px]"
          >
            <option value="">
              {commonFormatName ? commonFormatName : "Mixed / default"}
            </option>
            {commonFormats.map((product) => (
              <option key={product.id} value={product.name}>
                {product.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {networkPricing}
    </section>
  );
}
