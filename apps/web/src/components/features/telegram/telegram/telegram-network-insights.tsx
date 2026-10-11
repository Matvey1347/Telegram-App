"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Eye, Minus, TrendingDown, TrendingUp, UsersRound } from "lucide-react";
import type {
  TelegramChannelAudienceTrend,
  TelegramChannelTrafficAttributionPreview,
  TelegramChannelTrendMetric,
} from "@telegram-system/shared";
import { formatCompactMoney } from "@/lib/features/finance/money";
import { telegramChannelNetworksApi, type CurrencySettings } from "@/lib/api";
import { telegramChannelNetworkKeys } from "@/lib/query-keys";
import { TelegramPerformanceHistoryPanel } from "./telegram-performance-history-panel";
import { TelegramDynamicsModal } from "./telegram-dynamics-modal";
import { formatTrafficAttributionPeriod } from "./traffic-attribution-period";

const TrafficAttributionModal = dynamic(
  () =>
    import("./channel-traffic-attribution-modal").then(
      (module) => module.TrafficAttributionModal,
    ),
  { ssr: false, loading: () => null },
);

function number(value: unknown, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString(undefined, { maximumFractionDigits: digits })
    : "—";
}

function signedPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${number(value, 1)}%`;
}

function money(
  value: number | null | undefined,
  currency: string,
  settings?: CurrencySettings | null,
) {
  return value == null
    ? "—"
    : formatCompactMoney(value, currency, settings?.currencyDisplayMode);
}

function trendPresentation(value: number | null | undefined) {
  if (value == null || Math.abs(value) <= 1) {
    return { Icon: Minus, tone: "text-neutral-300" };
  }
  return value > 0
    ? { Icon: TrendingUp, tone: "text-emerald-300" }
    : { Icon: TrendingDown, tone: "text-rose-300" };
}

function TrendChip({
  label,
  metric,
  icon: Icon = TrendingUp,
  showAbsoluteChange = false,
}: {
  label: string;
  metric: TelegramChannelTrendMetric | null;
  icon?: typeof TrendingUp;
  showAbsoluteChange?: boolean;
}) {
  if (!metric) return null;
  const presentation = trendPresentation(metric.percentChange);
  const DeltaIcon = presentation.Icon;
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      <Icon size={11} className="text-sky-300" aria-hidden="true" />
      <span className="text-neutral-400">{label}</span>
      <span className={`font-semibold ${presentation.tone}`}>
        {showAbsoluteChange
          ? `${metric.absoluteChange > 0 ? "+" : ""}${number(metric.absoluteChange)} (${signedPercent(metric.percentChange)})`
          : signedPercent(metric.percentChange)}
      </span>
      <DeltaIcon size={10} className={presentation.tone} aria-hidden="true" />
    </span>
  );
}

export function NetworkDynamicsSummary({
  networkId,
  networkName,
  trend,
  fallbackPaybackPercent,
  fallbackAdsLeft,
}: {
  networkId: string;
  networkName: string;
  trend?: TelegramChannelAudienceTrend | null;
  fallbackPaybackPercent?: number | null;
  fallbackAdsLeft?: number | null;
}) {
  const [open, setOpen] = useState(false);
  if (!trend || (!trend.metrics.subscribers && !trend.metrics.reach))
    return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md border border-neutral-700 bg-neutral-950/40 px-1.5 py-0.5 text-[11px] tabular-nums transition hover:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={`Open network dynamics for ${networkName}`}
      >
        <TrendChip
          label="Subs · 30d"
          metric={trend.metrics.subscribers}
          showAbsoluteChange
        />
        {trend.metrics.subscribers && trend.metrics.reach ? (
          <span className="text-neutral-700">·</span>
        ) : null}
        <TrendChip label="24h views" metric={trend.metrics.reach} icon={Eye} />
      </button>

      <TelegramDynamicsModal
        open={open}
        onClose={() => setOpen(false)}
        title={`${networkName} · network dynamics`}
      >
        {open ? (
          <TelegramPerformanceHistoryPanel
            queryKey={(range) =>
              telegramChannelNetworkKeys.performanceHistory(networkId, range)
            }
            queryFn={(range) =>
              telegramChannelNetworksApi.performanceHistory(networkId, range)
            }
            scopeLabel="network"
            fallbackPaybackPercent={fallbackPaybackPercent}
            fallbackAdsLeft={fallbackAdsLeft}
          />
        ) : null}
      </TelegramDynamicsModal>
    </>
  );
}

export function NetworkTrafficAttributionSummary({
  networkId,
  networkName,
  traffic,
  trend,
  currencySettings,
}: {
  networkId: string;
  networkName: string;
  traffic?: TelegramChannelTrafficAttributionPreview | null;
  trend?: TelegramChannelAudienceTrend | null;
  currencySettings?: CurrencySettings | null;
}) {
  const [open, setOpen] = useState(false);
  if (!traffic?.sources.length) return null;
  const attributionPeriod = formatTrafficAttributionPeriod(
    traffic.attributionPeriod,
  );
  const audienceTrend = traffic.observedAudience ?? trend ?? null;
  const metrics = audienceTrend?.metrics;
  const subscribers = metrics?.subscribers ?? null;
  const requests = metrics?.pendingJoinRequests ?? null;
  // Missing historical request counters use the agreed zero baseline. The
  // Network's current request total must still include every channel.
  const startRequests = requests?.previous ?? 0;
  const currentRequests = requests?.current ?? 0;
  const requestChange = currentRequests - startRequests;
  const startTotal =
    subscribers && startRequests != null
      ? subscribers.previous + startRequests
      : null;
  const currentTotal =
    subscribers && currentRequests != null
      ? subscribers.current + currentRequests
      : null;
  const audiencePeriod = audienceTrend
    ? formatTrafficAttributionPeriod({
        startsAt: audienceTrend.baselineAt,
        endsAt: audienceTrend.currentAt,
      })
    : attributionPeriod;
  const range = audiencePeriod?.label?.split(" – ");
  const startLabel = range?.[0] ?? "Start";
  const endLabel = range?.[1] ?? "Now";

  return (
    <>
      <button
        type="button"
        className="mt-1.5 w-full rounded-md border border-neutral-800/80 bg-neutral-950/55 px-2 py-1.5 text-left transition hover:border-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        onClick={() => setOpen(true)}
        aria-label={`Open traffic attribution for ${networkName}`}
      >
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300">
            <UsersRound
              size={14}
              className="text-violet-300"
              aria-hidden="true"
            />
            Traffic sources
          </span>
          {audiencePeriod ? (
            <span
              title={audiencePeriod.title}
              className="text-[10px] text-neutral-500"
            >
              {audiencePeriod.label}
            </span>
          ) : null}
        </span>
        {subscribers ? (
          <span className="mt-1 block rounded border border-neutral-800/80 bg-neutral-950/40 px-1.5 py-1 text-[10px] tabular-nums">
            <span className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-0.5">
              <span className="text-neutral-500" />
              <span className="text-right text-neutral-500">Subs</span>
              <span className="text-right text-neutral-500">Requests</span>
              <span className="text-right text-neutral-500">Total</span>
              <span className="text-neutral-500">{startLabel}</span>
              <span className="text-right text-neutral-200">
                {number(subscribers.previous)}
              </span>
              <span className="text-right text-neutral-200">
                {startRequests == null ? "—" : number(startRequests)}
              </span>
              <span className="text-right text-neutral-200">
                {startTotal == null ? "—" : number(startTotal)}
              </span>
              <span className="text-neutral-500">{endLabel}</span>
              <span className="text-right text-neutral-200">
                {number(subscribers.current)}
              </span>
              <span className="text-right text-neutral-200">
                {currentRequests == null ? "—" : number(currentRequests)}
              </span>
              <span className="text-right text-neutral-200">
                {currentTotal == null ? "—" : number(currentTotal)}
              </span>
              <span className="text-neutral-500">Difference</span>
              <strong
                className={`text-right ${subscribers.absoluteChange > 0 ? "text-emerald-300" : subscribers.absoluteChange < 0 ? "text-rose-300" : "text-neutral-300"}`}
              >
                {subscribers.absoluteChange > 0 ? "+" : ""}
                {number(subscribers.absoluteChange)}
              </strong>
              <strong
                className={`text-right ${requestChange > 0 ? "text-emerald-300" : requestChange < 0 ? "text-rose-300" : "text-neutral-300"}`}
              >
                {requestChange > 0 ? "+" : ""}
                {number(requestChange)}
              </strong>
              <strong
                className={`text-right ${currentTotal != null && startTotal != null && currentTotal - startTotal > 0 ? "text-emerald-300" : currentTotal != null && startTotal != null && currentTotal - startTotal < 0 ? "text-rose-300" : "text-neutral-300"}`}
              >
                {currentTotal != null && startTotal != null
                  ? `${currentTotal - startTotal > 0 ? "+" : ""}${number(currentTotal - startTotal)}`
                  : "—"}
              </strong>
            </span>
          </span>
        ) : null}
        <span className="mt-1 grid grid-cols-3 gap-2 text-xs tabular-nums">
          <span className="min-w-0">
            <span className="block text-neutral-500">Acquired</span>
            <strong className="block truncate text-emerald-300">
              +{number(traffic.acquired)}
            </strong>
          </span>
          <span className="min-w-0">
            <span className="block text-neutral-500">Lost / drop</span>
            <strong className="flex truncate text-rose-300">
              {number(traffic.unsubscribed)}
            </strong>
          </span>
          <span className="min-w-0">
            <span className="block text-neutral-500">Paid CPA · all</span>
            <strong className="block truncate text-white">
              {money(
                traffic.allTimePaid?.retainedSubscriberCost ??
                  traffic.retainedSubscriberCost,
                traffic.currency,
                currencySettings,
              )}
            </strong>
          </span>
        </span>
      </button>

      {open ? (
        <TrafficAttributionModal
          title={`${networkName} · traffic attribution`}
          queryKey={telegramChannelNetworkKeys.trafficAttribution(networkId)}
          queryFn={() =>
            telegramChannelNetworksApi.trafficAttribution(networkId)
          }
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
