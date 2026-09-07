"use client";

import dynamic from "next/dynamic";
import { useState, type ComponentType } from "react";
import {
  Eye,
  Minus,
  Smile,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import type {
  TelegramChannelAudienceTrend,
  TelegramChannelTrendMetric,
} from "@telegram-system/shared";
import { Modal } from "@/components/ui/primitives";

const ChannelPerformanceHistoryPanel = dynamic(
  () =>
    import("./channel-performance-history-panel").then(
      (module) => module.ChannelPerformanceHistoryPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-40 animate-pulse rounded-lg border border-neutral-800 bg-neutral-950/40" />
    ),
  },
);

export function ChannelAudienceTrendButton({
  channelId,
  channelTitle,
  trend,
  paybackPercent,
  estimatedAdsRemaining,
}: {
  channelId: string;
  channelTitle: string;
  trend?: TelegramChannelAudienceTrend | null;
  paybackPercent?: number | null;
  estimatedAdsRemaining?: number | null;
}) {
  const [open, setOpen] = useState(false);
  if (!trend) return null;

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-950/40 px-1.5 py-0.5 text-[11px] font-medium transition hover:border-neutral-500"
        aria-label={`Open ${trend.periodDays}-day channel dynamics`}
        onClick={() => setOpen(true)}
      >
        <CompactMetric label="Subs" metric={trend.metrics.subscribers} />
        <span className="text-neutral-700">·</span>
        <CompactMetric label="Views" metric={trend.metrics.reach} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${channelTitle} · channel dynamics`}
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Change over {trend.periodDays} days
              </p>
              <p className="mt-1 text-sm text-neutral-300">
                {date(trend.baselineAt)} → {date(trend.currentAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ExpandedDelta
                label="Subscribers"
                metric={trend.metrics.subscribers}
              />
              <ExpandedDelta label="Views" metric={trend.metrics.reach} />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <TrendMetricCard
              label="Subscribers"
              icon={UsersRound}
              metric={trend.metrics.subscribers}
              digits={0}
            />
            <TrendMetricCard
              label="Average views"
              icon={Eye}
              metric={trend.metrics.reach}
              digits={1}
            />
            <TrendMetricCard
              label="Average reactions"
              icon={Smile}
              metric={trend.metrics.reactions}
              digits={1}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-800 bg-neutral-950/30 p-3 text-sm">
            <div>
              <p className="text-xs text-neutral-500">Current payback</p>
              <p className="mt-1 font-semibold text-white">
                {paybackPercent == null ? "—" : percent(paybackPercent)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Ads left</p>
              <p className="mt-1 font-semibold text-white">
                {estimatedAdsRemaining ?? "—"}
              </p>
            </div>
          </div>

          {open ? (
            <ChannelPerformanceHistoryPanel channelId={channelId} days={90} />
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function CompactMetric({
  label,
  metric,
}: {
  label: string;
  metric: TelegramChannelTrendMetric | null;
}) {
  const delta = metric?.percentChange;
  const presentation = deltaPresentation(delta);
  const Icon = presentation.Icon;
  return (
    <span className={`inline-flex items-center gap-0.5 ${presentation.tone}`}>
      <Icon size={11} aria-hidden="true" />
      <span className="text-neutral-400">{label}</span>
      <strong>{delta == null ? "—" : signedPercent(delta)}</strong>
    </span>
  );
}

function ExpandedDelta({
  label,
  metric,
}: {
  label: string;
  metric: TelegramChannelTrendMetric | null;
}) {
  const presentation = deltaPresentation(metric?.percentChange);
  const Icon = presentation.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-1 text-xs font-semibold ${presentation.tone}`}
    >
      <Icon size={12} aria-hidden="true" />
      {label}{" "}
      {metric?.percentChange == null
        ? "—"
        : signedPercent(metric.percentChange)}
    </span>
  );
}

function TrendMetricCard({
  label,
  icon: Icon,
  metric,
  digits,
}: {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  metric: TelegramChannelTrendMetric | null;
  digits: number;
}) {
  const tone = deltaPresentation(metric?.percentChange).tone;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
      <p className="flex items-center gap-1.5 text-xs text-neutral-500">
        <Icon size={13} className="text-neutral-400" />
        {label}
      </p>
      {metric ? (
        <>
          <p className="mt-2 text-sm font-semibold text-white">
            {number(metric.current, digits)}
          </p>
          <p className={`mt-1 text-xs font-medium ${tone}`}>
            {metric.percentChange == null
              ? signedNumber(metric.absoluteChange, digits)
              : `${signedNumber(metric.absoluteChange, digits)} · ${signedPercent(metric.percentChange)}`}
          </p>
          <p className="mt-1 text-[11px] text-neutral-600">
            from {number(metric.previous, digits)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">No comparable data</p>
      )}
    </div>
  );
}

function deltaPresentation(value?: number | null) {
  if (value == null || Math.abs(value) <= 1) {
    return { Icon: Minus, tone: "text-neutral-300" };
  }
  return value > 0
    ? { Icon: TrendingUp, tone: "text-emerald-300" }
    : { Icon: TrendingDown, tone: "text-rose-300" };
}

function number(value: number, digits: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signedNumber(value: number, digits: number) {
  return `${value > 0 ? "+" : ""}${number(value, digits)}`;
}

function percent(value: number) {
  return `${number(value, 1)}%`;
}

function signedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${percent(value)}`;
}

function date(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
