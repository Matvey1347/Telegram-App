"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import { DateInput, Select, TimeInput } from "@/components/ui/primitives";
import {
  TelegramChannelScopeModeToggle,
  TelegramChannelScopeSelector,
  type TelegramChannelScopeMode,
} from "@/components/features/telegram/telegram/telegram-channel-scope-selector";
import { CommonAdSlotOptions } from "../common-ad-slot-options";
import type { SalePlacementDraft } from "./ad-sale-types";

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
  placements,
  separateTimesByDate,
  separateFormatsByDate,
  commonFormats,
  effectiveChannelIds,
  networks,
  channels,
  onModeChange,
  onNetworkChange,
  onChannelsChange,
  onDateToAddChange,
  onSingleDateChange,
  onUseSingleDate,
  onAddDate,
  onRemoveDate,
  onCommonTimeChange,
  onCommonFormatChange,
  onDateTimeChange,
  onDateFormatChange,
  onSeparateTimesByDateChange,
  onSeparateFormatsByDateChange,
}: {
  mode: AdSaleScopeMode;
  selectedNetworkId: string;
  selectedChannelIds: string[];
  dateToAdd: string;
  placementDates: string[];
  commonTime: string;
  commonFormatName: string;
  placements: SalePlacementDraft[];
  separateTimesByDate: boolean;
  separateFormatsByDate: boolean;
  commonFormats: Array<{ id: string; name: string }>;
  effectiveChannelIds: string[];
  networks: TelegramChannelNetwork[];
  channels: TelegramChannel[];
  onModeChange: (mode: AdSaleScopeMode) => void;
  onNetworkChange: (networkId: string) => void;
  onChannelsChange: (channelIds: string[]) => void;
  onDateToAddChange: (date: string) => void;
  onSingleDateChange: (date: string) => void;
  onUseSingleDate: (date: string) => void;
  onAddDate: () => void;
  onRemoveDate: (date: string) => void;
  onCommonTimeChange: (time: string) => void;
  onCommonFormatChange: (formatName: string) => void;
  onDateTimeChange: (date: string, time: string) => void;
  onDateFormatChange: (date: string, formatName: string) => void;
  onSeparateTimesByDateChange: (separate: boolean) => void;
  onSeparateFormatsByDateChange: (separate: boolean) => void;
}) {
  const [multipleDates, setMultipleDates] = useState(placementDates.length > 1);

  return (
    <section className="space-y-3">
      <div className="grid min-w-0 gap-3 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 lg:col-span-3">
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
        </div>
        <div className="space-y-1">
          <label
            className="flex h-7 items-center text-sm text-neutral-300"
            htmlFor="ad-sale-date-to-add"
          >
            {multipleDates ? "Placement dates" : "Placement date"}
          </label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <DateInput
                id="ad-sale-date-to-add"
                value={dateToAdd}
                onChange={(event) =>
                  multipleDates
                    ? onDateToAddChange(event.target.value)
                    : onSingleDateChange(event.target.value)
                }
                className="h-[42px] min-h-0 w-full"
              />
            </div>
            {multipleDates ? (
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
            ) : null}
          </div>
          {multipleDates ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {placementDates.map((date) => (
                <span
                  key={date}
                  className="inline-flex items-center gap-1 rounded-md border border-blue-800/70 bg-blue-950/30 px-2 py-1 text-xs text-blue-100"
                >
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
              <button
                type="button"
                onClick={() => {
                  const date = placementDates[0] ?? dateToAdd;
                  onUseSingleDate(date);
                  setMultipleDates(false);
                }}
                className="px-1 text-xs text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
              >
                Use one date
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMultipleDates(true)}
              className="mt-1 text-xs text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline"
            >
              Add multiple dates
            </button>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          {placementDates.length > 1 ? (
            <div className="flex h-7 items-center justify-between gap-2">
              <span className="text-sm text-neutral-300">Time</span>
              <button type="button" onClick={() => onSeparateTimesByDateChange(!separateTimesByDate)} className="px-1 text-xs text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline">
                {separateTimesByDate ? "Use one time" : "Set by date"}
              </button>
            </div>
          ) : null}
          {separateTimesByDate && placementDates.length > 1 ? (
            <div className="space-y-3">
              {placementDates.map((date) => {
                const selectedTime = placements.find((item) => item.date === date)?.time ?? "12:00";
                return (
                  <div key={date} className="space-y-1">
                    <label className="block space-y-1">
                      <span className="sr-only">{date}</span>
                      <TimeInput aria-label={`Time ${date}`} value={selectedTime} onChange={(event) => onDateTimeChange(date, event.target.value)} className="h-[42px]" />
                    </label>
                    <CommonAdSlotOptions channelIds={effectiveChannelIds} date={date} selectedTime={selectedTime} onSelect={(time) => onDateTimeChange(date, time)} />
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <label className="block space-y-1">
                {placementDates.length <= 1 ? <span className="flex h-7 items-center text-sm text-neutral-300">Time</span> : <span className="sr-only">Time</span>}
                <TimeInput aria-label="Time" value={commonTime} onChange={(event) => onCommonTimeChange(event.target.value)} className="h-[42px]" />
              </label>
              <CommonAdSlotOptions
                channelIds={effectiveChannelIds}
                dates={placementDates}
                selectedTime={commonTime}
                onSelect={onCommonTimeChange}
              />
            </>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          {placementDates.length > 1 ? (
            <div className="flex h-7 items-center justify-between gap-2">
              <span className="text-sm text-neutral-300">Format</span>
              <button type="button" onClick={() => onSeparateFormatsByDateChange(!separateFormatsByDate)} className="px-1 text-xs text-neutral-400 underline-offset-2 hover:text-neutral-200 hover:underline">
                {separateFormatsByDate ? "Use one format" : "Set by date"}
              </button>
            </div>
          ) : null}
          {separateFormatsByDate && placementDates.length > 1 ? (
            <div className="space-y-2">
              {placementDates.map((date) => {
                const names = placements.filter((item) => item.date === date).map((item) => commonFormats.find((product) => product.id === item.productId)?.name);
                const value = names.length && names.every((name) => name === names[0]) ? names[0] ?? "" : "";
                return (
                  <label key={date} className="block space-y-1">
                    <span className="sr-only">{date}</span>
                    <Select aria-label={`Format ${date}`} value={value} onChange={(event) => onDateFormatChange(date, event.target.value)} className="h-[42px]">
                      <option value="">Mixed / default</option>
                      {commonFormats.map((product) => <option key={product.id} value={product.name}>{product.name}</option>)}
                    </Select>
                  </label>
                );
              })}
            </div>
          ) : (
            <label className="block space-y-1">
              {placementDates.length <= 1 ? <span className="flex h-7 items-center text-sm text-neutral-300">Format</span> : <span className="sr-only">Format</span>}
              <Select aria-label="Format" value={commonFormatName} onChange={(event) => onCommonFormatChange(event.target.value)} className="h-[42px]">
                <option value="">Mixed / default</option>
                {commonFormats.map((product) => <option key={product.id} value={product.name}>{product.name}</option>)}
              </Select>
            </label>
          )}
        </div>
      </div>
    </section>
  );
}
