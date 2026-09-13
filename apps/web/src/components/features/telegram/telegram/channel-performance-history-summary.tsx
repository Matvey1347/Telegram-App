import { Eye, Smile, UsersRound } from "lucide-react";
import type {
  TelegramChannelPerformanceHistory,
  TelegramChannelPerformanceHistoryPoint,
  TelegramChannelPerformanceHistoryRange,
  TelegramChannelTrendMetric,
} from "@telegram-system/shared";
import { ChannelPaybackStatus } from "./channel-payback-status";

export function ChannelPerformanceHistorySummary({
  points,
  comparisonPoint,
  range,
  fallbackPaybackPercent,
  fallbackAdsLeft,
}: {
  points: TelegramChannelPerformanceHistoryPoint[];
  comparisonPoint?: TelegramChannelPerformanceHistory["comparisonPoint"];
  range: TelegramChannelPerformanceHistoryRange;
  fallbackPaybackPercent?: number | null;
  fallbackAdsLeft?: number | null;
}) {
  const singleDay = range === "1d";
  const subscribersToday = todayMetric(
    points,
    comparisonPoint,
    "subscribers",
    0,
  );
  const reachToday = todayMetric(points, comparisonPoint, "averageViews", 1);
  const reactionsToday = todayMetric(
    points,
    comparisonPoint,
    "averageReactions",
    1,
  );
  const subscribers = singleDay
    ? subscribersToday.metric
    : endpointMetric(points, "subscribers", 0);
  const reach = singleDay
    ? reachToday.metric
    : halfPeriodAverageMetric(points, "averageViews", 1);
  const reactions = singleDay
    ? reactionsToday.metric
    : halfPeriodAverageMetric(points, "averageReactions", 1);
  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date;
  const payback = lastValue(points, "paybackPercent") ?? fallbackPaybackPercent;
  const adsLeft = lastValue(points, "adsLeft") ?? fallbackAdsLeft;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Recorded period
          </p>
          <p className="mt-1 text-sm text-neutral-300">
            {firstDate && lastDate
              ? `${shortDate(firstDate)} → ${shortDate(lastDate)}`
              : "No dated observations"}
          </p>
        </div>
        {!singleDay || subscribersToday.comparable || reachToday.comparable ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {!singleDay || subscribersToday.comparable ? (
              <DeltaPill label="Subscribers" metric={subscribers} />
            ) : null}
            {!singleDay || reachToday.comparable ? (
              <DeltaPill label="24h reach trend" metric={reach} />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <SummaryCard
          label="Subscribers"
          explanation={
            singleDay
              ? subscribersToday.comparable
                ? "Today versus yesterday"
                : "Latest recorded subscriber count today"
              : "Last recorded value versus first in this period"
          }
          icon={UsersRound}
          metric={subscribers}
          digits={0}
          showComparison={!singleDay || subscribersToday.comparable}
        />
        <SummaryCard
          label="24h average post reach"
          explanation={
            singleDay
              ? reachToday.comparable
                ? "Today versus yesterday"
                : "Latest recorded 24h post reach today"
              : "Second half average versus first half"
          }
          icon={Eye}
          metric={reach}
          digits={1}
          showComparison={!singleDay || reachToday.comparable}
        />
        <SummaryCard
          label="24h average reactions"
          explanation={
            singleDay
              ? reactionsToday.comparable
                ? "Today versus yesterday"
                : "Latest recorded 24h reactions today"
              : "Second half average versus first half"
          }
          icon={Smile}
          metric={reactions}
          digits={1}
          showComparison={!singleDay || reactionsToday.comparable}
        />
      </div>
      <ChannelPaybackStatus
        className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-3"
        paybackPercent={payback}
        adsLeft={adsLeft}
        showEmpty
      />
    </div>
  );
}

function SummaryCard({
  label,
  explanation,
  icon: Icon,
  metric,
  digits,
  showComparison,
}: {
  label: string;
  explanation: string;
  icon: typeof Eye;
  metric: TelegramChannelTrendMetric | null;
  digits: number;
  showComparison: boolean;
}) {
  const positive = (metric?.absoluteChange ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
      <p className="flex items-center gap-1.5 text-xs text-neutral-400">
        <Icon size={13} /> {label}
      </p>
      <p className="mt-1 text-[10px] leading-4 text-neutral-600">
        {explanation}
      </p>
      {metric ? (
        <>
          <p className="mt-2 text-sm font-semibold text-white">
            {formatNumber(metric.current, digits)}
          </p>
          {showComparison ? (
            <>
              <p
                className={
                  positive
                    ? "mt-1 text-xs font-medium text-emerald-300"
                    : "mt-1 text-xs font-medium text-rose-300"
                }
              >
                {signedNumber(metric.absoluteChange, digits)} ·{" "}
                {signedPercent(metric.percentChange)}
              </p>
              <p className="mt-1 text-[11px] text-neutral-600">
                from {formatNumber(metric.previous, digits)}
              </p>
            </>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">
          {showComparison ? "No comparable data" : "—"}
        </p>
      )}
    </div>
  );
}

function DeltaPill({
  label,
  metric,
}: {
  label: string;
  metric: TelegramChannelTrendMetric | null;
}) {
  const positive = (metric?.absoluteChange ?? 0) >= 0;
  return (
    <span
      className={`rounded-md border px-2 py-1 font-semibold ${
        metric
          ? positive
            ? "border-emerald-800 text-emerald-300"
            : "border-rose-900 text-rose-300"
          : "border-neutral-800 text-neutral-500"
      }`}
    >
      {label} {metric ? signedPercent(metric.percentChange) : "—"}
    </span>
  );
}

function todayMetric(
  points: TelegramChannelPerformanceHistoryPoint[],
  comparisonPoint:
    | TelegramChannelPerformanceHistory["comparisonPoint"]
    | undefined,
  metric: "subscribers" | "averageViews" | "averageReactions",
  digits: number,
) {
  const current = metricValues(points, metric).at(-1)?.value;
  const previous = comparisonPoint?.[metric];
  if (current == null) return { metric: null, comparable: false };
  return previous == null
    ? { metric: trendMetric(current, current, digits), comparable: false }
    : { metric: trendMetric(current, previous, digits), comparable: true };
}
function endpointMetric(
  points: TelegramChannelPerformanceHistoryPoint[],
  metric: "subscribers",
  digits: number,
) {
  const values = metricValues(points, metric);
  if (values.length < 2) return null;
  return trendMetric(values.at(-1)!.value, values[0].value, digits);
}

function halfPeriodAverageMetric(
  points: TelegramChannelPerformanceHistoryPoint[],
  metric: "averageViews" | "averageReactions",
  digits: number,
) {
  const values = metricValues(points, metric);
  if (values.length < 2) return null;
  const split = Math.max(1, Math.floor(values.length / 2));
  return trendMetric(
    average(values.slice(split).map(({ value }) => value)),
    average(values.slice(0, split).map(({ value }) => value)),
    digits,
  );
}

function metricValues(
  points: TelegramChannelPerformanceHistoryPoint[],
  metric: "subscribers" | "averageViews" | "averageReactions",
) {
  return points.flatMap((point) => {
    const value = point[metric];
    return value == null || !Number.isFinite(value) ? [] : [{ value }];
  });
}

function trendMetric(
  current: number,
  previous: number,
  digits: number,
): TelegramChannelTrendMetric {
  const absoluteChange = round(current - previous, digits);
  return {
    current: round(current, digits),
    previous: round(previous, digits),
    absoluteChange,
    percentChange:
      previous === 0
        ? null
        : round((absoluteChange / Math.abs(previous)) * 100, 1),
  };
}

function lastValue(
  points: TelegramChannelPerformanceHistoryPoint[],
  metric: "paybackPercent" | "adsLeft",
) {
  return points
    .map((point) => point[metric])
    .filter((value): value is number => value != null && Number.isFinite(value))
    .at(-1);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatNumber(value: number, digits: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function signedNumber(value: number, digits: number) {
  return `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;
}

function signedPercent(value: number | null) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value, 1)}%`;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
