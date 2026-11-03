"use client";

import type { TelegramChannelAudienceSnapshot } from "@/lib/api";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatLocalDate,
  formatLocalDateTime,
  type TelegramGraphChartData,
} from "./telegram-channel-graphs";

function toChartTimestamp(value: unknown) {
  if (value == null) return null;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue > 100000000000 ? numericValue : numericValue * 1000;
  }
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function TelegramChannelAudienceChart({
  snapshots,
}: {
  snapshots: TelegramChannelAudienceSnapshot[];
}) {
  const chartRows = snapshots
    .map((snapshot) => ({
      timestamp: toChartTimestamp(snapshot.collectedAt),
      subscribersCount: snapshot.subscribersCount ?? null,
      activeSubscribersEstimate: snapshot.activeSubscribersEstimate ?? null,
    }))
    .filter(
      (row) =>
        row.timestamp != null &&
        (row.subscribersCount != null || row.activeSubscribersEstimate != null),
    );
  if (!chartRows.length) return null;

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-950/20 p-3">
      <h3 className="mb-2.5 text-base font-semibold">Audience chart</h3>
      <div className="h-64 rounded-lg bg-slate-900/40 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartRows}
            margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
          >
            <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => formatLocalDate(value)}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              minTickGap={24}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} width={48} />
            <Tooltip
              labelFormatter={(value) => formatLocalDateTime(value)}
              contentStyle={{
                background: "#020617",
                border: "1px solid #334155",
                borderRadius: 10,
              }}
              labelStyle={{ color: "#e2e8f0" }}
            />
            <Line
              type="linear"
              dataKey="subscribersCount"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              name="Subscribers"
            />
            <Line
              type="linear"
              dataKey="activeSubscribersEstimate"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              name="Active estimate"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function MtprotoGraphChart({
  chart,
}: {
  chart: TelegramGraphChartData;
}) {
  return (
    <div className="rounded-lg bg-slate-900/40 p-2">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chart.rows}
            margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
          >
            <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => formatLocalDate(value)}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              minTickGap={24}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} width={42} />
            <Tooltip
              labelFormatter={(value) => formatLocalDateTime(value)}
              contentStyle={{
                background: "#020617",
                border: "1px solid #334155",
                borderRadius: 10,
              }}
              labelStyle={{ color: "#e2e8f0" }}
            />
            {chart.series.map((series) =>
              series.type === "bar" ? (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  fill={series.color}
                  name={series.name}
                  stackId="telegram"
                />
              ) : (
                <Line
                  key={series.key}
                  type={series.type === "step" ? "stepAfter" : "linear"}
                  dataKey={series.key}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={false}
                  name={series.name}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 px-1 pb-1">
        {chart.series.map((item) => (
          <span
            key={item.key}
            className="rounded-md px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
            style={{ backgroundColor: item.color }}
          >
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}
