"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { UsersRound, UserMinus } from "lucide-react";
import { Tooltip } from "@/components/ui/primitives";
import type { TelegramChannel } from "@/lib/api";
import { formatTrafficAttributionPeriod } from "./traffic-attribution-period";

const loadTrafficAttributionModal = () =>
  import("./channel-traffic-attribution-modal").then(
    (module) => module.ChannelTrafficAttributionModal,
  );

const ChannelTrafficAttributionModal = dynamic(loadTrafficAttributionModal, {
  ssr: false,
  // Do not momentarily render a block-level skeleton inside the channel card
  // while the dialog chunk is loading. The dialog itself owns its data state.
  loading: () => null,
});

function money(value: number | null, currency: string) {
  return value == null
    ? "—"
    : `${number(value, value < 10 ? 2 : 1)} ${currency}`;
}

function number(value: unknown, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString(undefined, { maximumFractionDigits: digits })
    : "—";
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatKpi(value: number | null, currency: string, prefix: string) {
  return value == null ? "—" : `${prefix} ${number(value, 2)} ${currency}`;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${number(value)}`;
}

function periodRows(period: ReturnType<typeof formatTrafficAttributionPeriod>) {
  const range = period?.label?.split(" – ");
  return { start: range?.[0] ?? "Start", now: range?.[1] ?? "Now" };
}

function KpiRangeChip({
  tone,
  label,
}: {
  tone: "target" | "ok" | "stop";
  label: string;
}) {
  const className = {
    target: "border-emerald-700 bg-emerald-950/50 text-emerald-200",
    ok: "border-yellow-700 bg-yellow-950/50 text-yellow-200",
    stop: "border-rose-700 bg-rose-950/50 text-rose-200",
  }[tone];

  return (
    <span className={`rounded border px-2 py-1 ${className}`}>{label}</span>
  );
}

function PaidCpaKpiTooltip({ channel }: { channel: TelegramChannel }) {
  const currency = channel.kpiCurrency || channel.adBaseCurrency || "USD";
  const targetTo = numberOrNull(channel.targetCpa);
  const stopFrom =
    numberOrNull(channel.stopCpaFrom) ?? numberOrNull(channel.stopCpa);

  return (
    <div className="w-72 space-y-2">
      <div className="font-semibold text-white">KPI ({currency})</div>
      <div className="flex flex-wrap gap-1.5">
        <KpiRangeChip
          tone="target"
          label={`target ${formatKpi(targetTo, currency, "to")}`}
        />
        <KpiRangeChip
          tone="ok"
          label={`ok ${targetTo != null && stopFrom != null ? `${number(targetTo, 2)}–${number(stopFrom, 2)} ${currency}` : "—"}`}
        />
        <KpiRangeChip
          tone="stop"
          label={`stop ${formatKpi(stopFrom, currency, "from")}`}
        />
      </div>
    </div>
  );
}

export function ChannelTrafficAttributionSummary({
  channel,
  compact = false,
}: {
  channel: TelegramChannel;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const summary = channel.preview?.trafficAttribution;
  if (!summary?.sources.length) return null;
  // A browser can receive a cached response from an API instance that has not
  // yet deployed the lifetime aggregate. Keep the card usable during that
  // short rolling-deploy window.
  const paidCpa =
    summary.allTimePaid?.retainedSubscriberCost ??
    summary.retainedSubscriberCost;
  const attributionPeriod = formatTrafficAttributionPeriod(
    summary.attributionPeriod,
  );
  // This is the same rolling 30-day (or shorter available) period as the
  // attribution totals above. It must never fall back to the channel's full
  // lifetime just because an older snapshot exists.
  const audienceTrend = summary.observedAudience ?? null;
  const trendMetrics = audienceTrend?.metrics;
  // The channel/audience period can be shorter than attribution's requested
  // 30-day window when the channel only started being observed recently.
  // Show that real range instead of labelling the first known point as Sep 10.
  const channelSnapshotPeriod = audienceTrend
    ? formatTrafficAttributionPeriod({
        startsAt: audienceTrend.baselineAt,
        endsAt: audienceTrend.currentAt,
      })
    : attributionPeriod;
  const subscriberChange = trendMetrics?.subscribers?.absoluteChange ?? null;
  const currentRequests =
    trendMetrics?.pendingJoinRequests?.current ??
    channel.preview?.bookingSchedule?.pendingJoinRequests ??
    0;
  // Historical snapshots made before request tracking store no counter. Use
  // the agreed zero baseline so Total and Difference remain visible.
  const baselineRequests = trendMetrics?.pendingJoinRequests?.previous ?? 0;
  const joinRequestChange = currentRequests - baselineRequests;
  const totalPrevious =
    trendMetrics?.subscribers && baselineRequests != null
      ? trendMetrics.subscribers.previous + baselineRequests
      : null;
  const totalCurrent =
    trendMetrics?.subscribers && currentRequests != null
      ? trendMetrics.subscribers.current + currentRequests
      : null;
  const targetCpa = Number(channel.targetCpa);
  const periodRow = periodRows(channelSnapshotPeriod);
  const meetsKpi =
    paidCpa != null && Number.isFinite(targetCpa) && targetCpa > 0
      ? paidCpa <= targetCpa
      : null;

  return (
    <>
      <section
        className={`w-full cursor-pointer rounded-md border border-neutral-800/80 bg-neutral-950/55 px-2 text-left transition hover:border-neutral-600 ${compact ? "mt-1.5 py-1.5" : "mt-2 py-2"}`}
        onClick={() => setOpen(true)}
        onPointerEnter={() => void loadTrafficAttributionModal()}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onFocus={() => void loadTrafficAttributionModal()}
            aria-label={`Open traffic attribution for ${channel.title}`}
          >
            <UsersRound size={14} className="text-violet-300" />
            Traffic sources
          </button>
          {channelSnapshotPeriod ? (
            <span
              title={channelSnapshotPeriod.title}
              className="text-[10px] text-neutral-500"
            >
              {channelSnapshotPeriod.label}
            </span>
          ) : null}
        </div>
        {subscriberChange != null ? (
          <span className="mt-1 block rounded border border-neutral-800/80 bg-neutral-950/40 px-1.5 py-1 text-[10px] tabular-nums">
            <span className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-0.5">
              <span className="text-neutral-500" />
              <span className="text-right text-neutral-500">Subs</span>
              <span className="text-right text-neutral-500">Requests</span>
              <span className="text-right text-neutral-500">Total</span>
              <span className="text-neutral-500">{periodRow.start}</span>
              <span className="text-right text-neutral-200">
                {number(trendMetrics!.subscribers!.previous)}
              </span>
              <span className="text-right text-neutral-200">
                {baselineRequests != null ? number(baselineRequests) : "—"}
              </span>
              <span className="text-right text-neutral-200">
                {totalPrevious != null ? number(totalPrevious) : "—"}
              </span>
              <span className="text-neutral-500">{periodRow.now}</span>
              <span className="text-right text-neutral-200">
                {number(trendMetrics!.subscribers!.current)}
              </span>
              <span className="text-right text-neutral-200">
                {currentRequests != null ? number(currentRequests) : "—"}
              </span>
              <span className="text-right text-neutral-200">
                {totalCurrent != null ? number(totalCurrent) : "—"}
              </span>
              <span className="text-neutral-500">Difference</span>
              <strong
                className={`text-right ${subscriberChange > 0 ? "text-emerald-300" : subscriberChange < 0 ? "text-rose-300" : "text-neutral-300"}`}
              >
                {signed(subscriberChange)}
              </strong>
              <strong
                className={`text-right ${joinRequestChange && joinRequestChange > 0 ? "text-emerald-300" : joinRequestChange ? "text-rose-300" : "text-neutral-300"}`}
              >
                {joinRequestChange != null ? signed(joinRequestChange) : "—"}
              </strong>
              <strong
                className={`text-right ${totalCurrent != null && totalPrevious != null && totalCurrent - totalPrevious > 0 ? "text-emerald-300" : totalCurrent != null && totalPrevious != null && totalCurrent - totalPrevious < 0 ? "text-rose-300" : "text-neutral-300"}`}
              >
                {totalCurrent != null && totalPrevious != null
                  ? signed(totalCurrent - totalPrevious)
                  : "—"}
              </strong>
            </span>
          </span>
        ) : null}
        <span
          className={`grid grid-cols-3 gap-2 text-xs tabular-nums ${compact ? "mt-1" : "mt-1.5"}`}
        >
          <span>
            <span className="block text-neutral-500">Acquired</span>
            <strong className="text-emerald-300">
              +{number(summary.acquired)}
            </strong>
          </span>
          <span>
            <span className="block text-neutral-500">Lost / drop</span>
            <strong className="inline-flex items-center gap-1 text-rose-300">
              <UserMinus size={12} /> {number(summary.unsubscribed)}
            </strong>
          </span>
          <span>
            <span className="block text-neutral-500">Paid CPA · all</span>
            <Tooltip content={<PaidCpaKpiTooltip channel={channel} />}>
              <button
                type="button"
                className={`cursor-help font-semibold tabular-nums underline decoration-dotted underline-offset-2 ${
                  meetsKpi === true
                    ? "text-emerald-300"
                    : meetsKpi === false
                      ? "text-rose-300"
                      : "text-white"
                }`}
                aria-label={`Paid CPA ${money(paidCpa, summary.currency)}. Show KPI ranges.`}
                onClick={(event) => event.stopPropagation()}
              >
                {money(paidCpa, summary.currency)}
              </button>
            </Tooltip>
          </span>
        </span>
      </section>
      {open ? (
        <ChannelTrafficAttributionModal
          channel={channel}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
