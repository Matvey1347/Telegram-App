"use client";

import type { ReactNode } from "react";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { DateRangeInput, Select, TimeInput } from "@/components/ui/primitives";
import {
  TelegramChannelScopeModeToggle,
  TelegramChannelScopeSelector,
  type TelegramChannelScopeMode,
} from "@/components/features/telegram/telegram/telegram-channel-scope-selector";
import { CommonAdSlotOptions } from "../common-ad-slot-options";

export type AdSaleScopeMode = TelegramChannelScopeMode;

export function AdSaleScopeModeToggle({
  mode,
  onChange,
}: {
  mode: AdSaleScopeMode;
  onChange: (mode: AdSaleScopeMode) => void;
}) {
  return (
    <TelegramChannelScopeModeToggle
      mode={mode}
      onChange={onChange}
      ariaLabel="Placement source"
    />
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
  effectiveChannelIds,
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
  effectiveChannelIds: string[];
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
        <TelegramChannelScopeSelector
          mode={mode}
          selectedNetworkId={selectedNetworkId}
          selectedChannelIds={selectedChannelIds}
          networks={networks}
          channels={channels}
          onModeChange={onModeChange}
          onNetworkChange={onNetworkChange}
          onChannelsChange={onChannelsChange}
          label="Placement source"
        />
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
        <div className="min-w-0 space-y-2">
          <label className="block space-y-1">
            <span className="flex h-7 items-center text-sm text-neutral-300">
              Time for all
            </span>
            <TimeInput
              value={commonTime}
              onChange={(event) => onCommonTimeChange(event.target.value)}
              className="h-[42px]"
            />
          </label>
          <CommonAdSlotOptions
            channelIds={effectiveChannelIds}
            date={dateRange.from}
            selectedTime={commonTime}
            onSelect={onCommonTimeChange}
          />
          {dateRange.from && dateRange.to && dateRange.from !== dateRange.to ? (
            <p className="text-xs text-neutral-500">
              Status reflects the first date. The selected time applies to every
              placement date.
            </p>
          ) : null}
        </div>
        <label className="space-y-1">
          <span className="flex h-7 items-center text-sm text-neutral-300">
            Format for all
          </span>
          <Select
            value={commonFormatName}
            onChange={(event) => onCommonFormatChange(event.target.value)}
            className="h-[42px]"
          >
            <option value="">Mixed / default</option>
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
