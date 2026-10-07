"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { DateInput, Select, TimeInput } from "@/components/ui/primitives";
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
  dateToAdd,
  placementDates,
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
  onDateToAddChange,
  onAddDate,
  onRemoveDate,
  onCommonTimeChange,
  onCommonFormatChange,
}: {
  mode: AdSaleScopeMode;
  selectedNetworkId: string;
  selectedChannelIds: string[];
  dateToAdd: string;
  placementDates: string[];
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
  onDateToAddChange: (date: string) => void;
  onAddDate: () => void;
  onRemoveDate: (date: string) => void;
  onCommonTimeChange: (time: string) => void;
  onCommonFormatChange: (formatName: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_minmax(360px,1.6fr)_160px_minmax(190px,0.8fr)] xl:items-start">
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
          <label className="flex h-7 items-center text-sm text-neutral-300" htmlFor="ad-sale-date-to-add">
            Placement dates
          </label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <DateInput
                id="ad-sale-date-to-add"
                value={dateToAdd}
                onChange={(event) => onDateToAddChange(event.target.value)}
                className="h-[42px] min-h-0 w-full"
              />
            </div>
            <button
              type="button"
              onClick={onAddDate}
              disabled={!dateToAdd || placementDates.includes(dateToAdd)}
              aria-label="Add date"
              title="Add date"
              className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {placementDates.map((date) => (
              <span key={date} className="inline-flex items-center gap-1 rounded-md border border-blue-800/70 bg-blue-950/30 px-2 py-1 text-xs text-blue-100">
                {date}
                <button
                  type="button"
                  aria-label={`Remove ${date}`}
                  onClick={() => onRemoveDate(date)}
                  className="text-blue-300 hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
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
            date={placementDates[0] ?? ""}
            selectedTime={commonTime}
            onSelect={onCommonTimeChange}
          />
          {placementDates.length > 1 ? (
            <p className="text-xs text-neutral-500">
              Status reflects the first selected date. You can change each
              placement after adding the dates.
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
