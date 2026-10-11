"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  TelegramChannelPerformanceHistory,
  TelegramChannelPerformanceHistoryRange,
} from "@telegram-system/shared";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ChannelPerformanceHistoryCharts } from "./channel-performance-history-chart";
import { ChannelPerformanceHistorySummary } from "./channel-performance-history-summary";
import { ChannelDynamicsSkeleton } from "./channel-dynamics-skeleton";

const RANGE_OPTIONS = [
  { value: "1d", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
] as const;
const RANGE_STORAGE_KEY = "telegram-channel-dynamics:range:v2";
const RANGE_VALUES = RANGE_OPTIONS.map(({ value }) => value);

export function TelegramPerformanceHistoryPanel({
  queryKey,
  queryFn,
  scopeLabel,
  fallbackPaybackPercent,
  fallbackAdsLeft,
}: {
  queryKey: (range: TelegramChannelPerformanceHistoryRange) => readonly unknown[];
  queryFn: (
    range: TelegramChannelPerformanceHistoryRange,
  ) => Promise<TelegramChannelPerformanceHistory>;
  scopeLabel: "channel" | "network";
  fallbackPaybackPercent?: number | null;
  fallbackAdsLeft?: number | null;
}) {
  const [range, setRange] =
    useState<TelegramChannelPerformanceHistoryRange>(readStoredRange);
  const changeRange = useCallback(
    (nextRange: TelegramChannelPerformanceHistoryRange) => {
      window.localStorage.setItem(RANGE_STORAGE_KEY, nextRange);
      setRange(nextRange);
    },
    [],
  );
  const historyQuery = useQuery({
    queryKey: queryKey(range),
    queryFn: () => queryFn(range),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-white">{rangeLabel(range)}</h4>
          <p className="mt-1 text-xs text-neutral-500">
            The selected period applies to every metric and chart below.
          </p>
        </div>
        <SegmentedControl
          value={range}
          options={RANGE_OPTIONS}
          onChange={changeRange}
          ariaLabel={`${scopeLabel === "network" ? "Network" : "Channel"} history period`}
        />
      </div>

      {historyQuery.isLoading || historyQuery.isFetching ? (
        <ChannelDynamicsSkeleton />
      ) : historyQuery.isError ? (
        <div className="rounded-lg border border-rose-900/70 bg-rose-950/20 p-4 text-sm text-rose-200">
          Failed to load {scopeLabel} history. Try another period or reopen the dynamics.
        </div>
      ) : !historyQuery.data?.points?.length ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-4 text-sm text-neutral-400">
          No recorded {scopeLabel} history is available for this period yet.
        </div>
      ) : (
        <>
          <ChannelPerformanceHistorySummary
            points={historyQuery.data.points}
            comparisonPoint={historyQuery.data.comparisonPoint}
            range={range}
            fallbackPaybackPercent={fallbackPaybackPercent}
            fallbackAdsLeft={fallbackAdsLeft}
          />
          <ChannelPerformanceHistoryCharts points={historyQuery.data.points} />
        </>
      )}
    </section>
  );
}

function readStoredRange(): TelegramChannelPerformanceHistoryRange {
  if (typeof window === "undefined") return "7d";
  const stored = window.localStorage.getItem(RANGE_STORAGE_KEY);
  return RANGE_VALUES.includes(stored as TelegramChannelPerformanceHistoryRange)
    ? (stored as TelegramChannelPerformanceHistoryRange)
    : "7d";
}

function rangeLabel(range: TelegramChannelPerformanceHistoryRange) {
  if (range === "1d") return "Today";
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  if (range === "90d") return "Last 90 days";
  return "All recorded history";
}
