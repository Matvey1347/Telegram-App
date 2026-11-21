"use client";

import {
  Button,
  DateRangeInput,
  FormField,
  Skeleton,
} from "@/components/ui/primitives";
import { MetricPreviewLabel } from "@/lib/metric-preview-icons";
import { InfoTooltip } from "./channel-analytics-primitives";

export function RangePicker({
  rangeMode,
  setRangeMode,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
}: {
  rangeMode: "30d" | "all" | "custom";
  setRangeMode: (value: "30d" | "all" | "custom") => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
}) {
  return (
    <section className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-700 bg-slate-950/20 p-3">
      <Button
        variant={rangeMode === "30d" ? "primary" : "secondary"}
        type="button"
        onClick={() => setRangeMode("30d")}
      >
        30d
      </Button>
      <Button
        variant={rangeMode === "all" ? "primary" : "secondary"}
        type="button"
        onClick={() => setRangeMode("all")}
      >
        All
      </Button>
      <Button
        variant={rangeMode === "custom" ? "primary" : "secondary"}
        type="button"
        onClick={() => setRangeMode("custom")}
      >
        Custom
      </Button>
      {rangeMode === "custom" ? (
        <div className="w-72">
          <FormField label="Period">
            <DateRangeInput
              from={customFrom}
              to={customTo}
              onChange={(range) => {
                setCustomFrom(range.from);
                setCustomTo(range.to);
              }}
            />
          </FormField>
        </div>
      ) : null}
    </section>
  );
}

export function ChannelMetricsDeck({
  metrics,
}: {
  metrics: Array<{
    key: string;
    title: string;
    value: string;
    hint?: string;
    tip?: string;
  }>;
}) {
  if (!metrics.length) return null;
  const primaryKeys = new Set([
    "subscribers",
    "posts",
    "err",
    "avgViews",
    "cpa",
  ]);
  const primaryMetrics = metrics.filter((metric) =>
    primaryKeys.has(metric.key),
  );
  const secondaryMetrics = metrics.filter(
    (metric) => !primaryKeys.has(metric.key),
  );
  const visiblePrimary = primaryMetrics.length
    ? primaryMetrics
    : metrics.slice(0, 4);
  const visibleSecondary = primaryMetrics.length
    ? secondaryMetrics
    : metrics.slice(4);
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase text-slate-400">
          Channel pulse
        </h3>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
          {metrics.length} metrics
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {visiblePrimary.map((metric) => (
          <div
            key={metric.key}
            className="min-h-[82px] rounded-lg border border-slate-800 bg-slate-900/40 p-3"
          >
            <div className="flex items-center gap-1">
              <MetricPreviewLabel
                label={metric.title}
                metricKey={metric.key}
                className="truncate text-xs text-slate-400"
              />
              {metric.tip ? <InfoTooltip tip={metric.tip} /> : null}
            </div>
            <p className="mt-1.5 truncate text-xl font-semibold text-white">
              {metric.value}
            </p>
            {metric.hint ? (
              <p className="mt-1 truncate text-xs text-slate-500">
                {metric.hint}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {visibleSecondary.length ? (
        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-2">
          {visibleSecondary.map((metric) => (
            <CompactMetric key={metric.key} metric={metric} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompactMetric({
  metric,
}: {
  metric: {
    key?: string;
    title: string;
    value: string;
    hint?: string;
    tip?: string;
  };
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <MetricPreviewLabel
            label={metric.title}
            metricKey={metric.key}
            className="truncate text-xs text-slate-400"
          />
          {metric.tip ? <InfoTooltip tip={metric.tip} /> : null}
        </div>
        <p className="shrink-0 text-sm font-semibold text-slate-100">
          {metric.value}
        </p>
      </div>
      {metric.hint ? (
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {metric.hint}
        </p>
      ) : null}
    </div>
  );
}

export function ChannelAnalyticsHeroSkeleton() {
  return (
    <>
      <div className="mt-3">
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)]">
        <div className="min-w-0 space-y-3">
          <div className="rounded-lg border border-slate-700 bg-slate-950/20 p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-5 w-40" />
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/20 p-4">
            <div className="flex gap-3">
              <Skeleton className="h-14 w-24 rounded-xl" />
              <Skeleton className="h-14 w-24 rounded-xl" />
              <Skeleton className="h-14 w-28 rounded-xl" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950/20 p-4">
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-4/5" />
            <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
