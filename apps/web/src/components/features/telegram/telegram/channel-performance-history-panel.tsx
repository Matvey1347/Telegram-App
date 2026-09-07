"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TelegramChannelPerformanceHistoryPoint } from "@telegram-system/shared";
import { telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";

type ChartMetric = "subscribers" | "averageViews" | "paybackPercent";

export function ChannelPerformanceHistoryPanel({
  channelId,
  days,
}: {
  channelId: string;
  days: number;
}) {
  const historyQuery = useQuery({
    queryKey: telegramChannelKeys.performanceHistory(channelId, days),
    queryFn: () => telegramChannelsApi.performanceHistory(channelId, days),
    staleTime: 5 * 60 * 1000,
  });

  if (historyQuery.isLoading) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-56 animate-pulse rounded-lg border border-neutral-800 bg-neutral-950/40"
          />
        ))}
      </div>
    );
  }
  if (historyQuery.isError) {
    return (
      <div className="rounded-lg border border-rose-900/70 bg-rose-950/20 p-4 text-sm text-rose-200">
        Failed to load channel history. Try opening the dynamics again.
      </div>
    );
  }

  const points = historyQuery.data?.points ?? [];
  if (!points.length) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-4 text-sm text-neutral-400">
        No channel history is available yet.
      </div>
    );
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-white">Last {days} days</h4>
        <span className="text-xs text-neutral-500">
          Payback uses cumulative actual spend and received revenue
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <HistoryChart
          title="Subscribers"
          metric="subscribers"
          color="#a78bfa"
          points={points}
        />
        <HistoryChart
          title="Average views"
          metric="averageViews"
          color="#38bdf8"
          points={points}
        />
        <HistoryChart
          title="Payback"
          metric="paybackPercent"
          color="#fbbf24"
          points={points}
          percentAxis
        />
      </div>
    </section>
  );
}

function HistoryChart({
  title,
  metric,
  color,
  points,
  percentAxis = false,
}: {
  title: string;
  metric: ChartMetric;
  color: string;
  points: TelegramChannelPerformanceHistoryPoint[];
  percentAxis?: boolean;
}) {
  const hasValues = points.some((point) => point[metric] != null);
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        {title}
      </p>
      {hasValues ? (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 6, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                stroke="#737373"
                tick={{ fontSize: 10 }}
                minTickGap={20}
              />
              <YAxis
                stroke="#737373"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) =>
                  percentAxis
                    ? `${compactNumber(value)}%`
                    : compactNumber(value)
                }
                width={48}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a0a0a",
                  border: "1px solid #404040",
                  borderRadius: 8,
                  color: "#f5f5f5",
                }}
                labelFormatter={(value) => fullDate(String(value))}
                formatter={(value) => [
                  percentAxis
                    ? `${Number(value).toFixed(1)}%`
                    : Number(value).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      }),
                  title,
                ]}
              />
              <Line
                type="monotone"
                dataKey={metric}
                name={title}
                stroke={color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center text-xs text-neutral-500">
          No data yet
        </div>
      )}
    </div>
  );
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function compactNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(parsed) >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(parsed);
}
