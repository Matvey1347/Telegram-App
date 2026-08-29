"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function toChartTimestamp(value: unknown) {
  const number = Number(value);
  if (Number.isFinite(number)) return number < 1e11 ? number * 1000 : number;
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}
function formatLocalDate(value?: string | Date | number | null) {
  if (value == null) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}
function formatLocalDateTime(value?: string | Date | number | null) {
  if (value == null) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}
function formatPercent(value: unknown, decimals = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(decimals)}%` : "-";
}

export function formatTelegramPercent(metric: any) {
  const part = Number(metric?.part);
  const total = Number(metric?.total);
  if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0)
    return "-";
  return formatPercent((part / total) * 100, 1);
}

export function formatStatsPeriod(period: any, graphs?: Record<string, any>) {
  if (!period) return "-";
  const graphDates = extractGraphDateValues(graphs);
  const minDate = earliestTelegramDateValue([
    period.minDate || period.min_date,
    ...graphDates,
  ]);
  const maxDate = latestTelegramDateValue([
    period.maxDate || period.max_date,
    ...graphDates,
  ]);
  return `${formatTelegramDate(minDate)} - ${formatTelegramDate(maxDate)}`;
}

function formatTelegramDate(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue))
    return formatLocalDate(value as string | Date | null);
  return formatLocalDate(
    new Date(numericValue < 100000000000 ? numericValue * 1000 : numericValue),
  );
}

function latestTelegramDateValue(values: unknown[]) {
  let latest: unknown = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const time = toTelegramDateTime(value);
    if (time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }
  return latest;
}

function earliestTelegramDateValue(values: unknown[]) {
  let earliest: unknown = null;
  let earliestTime = Number.POSITIVE_INFINITY;
  for (const value of values) {
    const time = toTelegramDateTime(value);
    if (time === Number.NEGATIVE_INFINITY) continue;
    if (time < earliestTime) {
      earliest = value;
      earliestTime = time;
    }
  }
  return earliest;
}

function extractGraphDateValues(graphs?: Record<string, any>) {
  const values: unknown[] = [];
  for (const graph of Object.values(graphs || {})) {
    const columns = graph?.data?.columns;
    if (!Array.isArray(columns)) continue;
    const dates = columns.find(
      (column: unknown) => Array.isArray(column) && column[0] === "x",
    );
    if (!Array.isArray(dates)) continue;
    values.push(...dates.slice(1));
  }
  return values;
}

function toTelegramDateTime(value: unknown) {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue < 100000000000 ? numericValue * 1000 : numericValue;
  }
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime())
    ? Number.NEGATIVE_INFINITY
    : date.getTime();
}

type TelegramGraphChartData = {
  rows: Array<Record<string, string | number> & { timestamp: number }>;
  series: Array<{ color: string; key: string; name: string; type: string }>;
};

export const mtprotoGraphConfigs = [
  { key: "followers_graph", title: "Followers" },
  { key: "growth_graph", title: "Growth" },
  { key: "views_graph", title: "Views" },
  { key: "languages_graph", title: "Audience Languages" },
  { key: "mute_graph", title: "Notifications Muted" },
  { key: "views_by_source_graph", title: "Views by Source" },
  { key: "new_followers_by_source_graph", title: "New Followers by Source" },
  { key: "reactions_by_emotion_graph", title: "Reactions by Emotion" },
] as const;

const telegramGraphColors = [
  "#38bdf8",
  "#22c55e",
  "#f59e0b",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#2dd4bf",
];

export function normalizeStoredTelegramGraph(
  points: any[] | undefined,
  metric: string,
): TelegramGraphChartData | null {
  const metricPoints = (points || []).filter(
    (point) => point.metric === metric,
  );
  if (!metricPoints.length) return null;
  const rowsByDate = new Map<
    number,
    Record<string, string | number> & { timestamp: number }
  >();
  const seriesByKey = new Map<
    string,
    TelegramGraphChartData["series"][number]
  >();

  for (const point of metricPoints) {
    const timestamp = toChartTimestamp(point.date);
    if (timestamp == null) continue;
    const row = rowsByDate.get(timestamp) || { timestamp };
    row[String(point.series)] = toNumber(point.value);
    rowsByDate.set(timestamp, row);

    if (!seriesByKey.has(String(point.series))) {
      seriesByKey.set(String(point.series), {
        key: String(point.series),
        name: String(point.seriesLabel || point.series),
        color: normalizeTelegramColor(
          point.color,
          telegramGraphColors[seriesByKey.size % telegramGraphColors.length],
        ),
        type: String(point.graphType || "line"),
      });
    }
  }

  return {
    rows: Array.from(rowsByDate.entries())
      .sort(([left], [right]) => left - right)
      .map(([, row]) => row),
    series: Array.from(seriesByKey.values()),
  };
}

export function normalizeTelegramGraph(graph: any): TelegramGraphChartData | null {
  if (graph?.status !== "available") return null;
  let payload = graph.data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(payload?.columns)) return null;
  const columns = payload.columns.filter(
    (column: unknown) => Array.isArray(column) && column.length > 1,
  ) as Array<Array<string | number>>;
  const xColumn = columns.find((column) => column[0] === "x");
  const valueColumns = columns.filter((column) => column[0] !== "x");
  if (!xColumn || !valueColumns.length) return null;

  const series = valueColumns.map((column, index) => {
    const key = String(column[0]);
    return {
      key,
      name: String(payload.names?.[key] || key),
      color: normalizeTelegramColor(
        payload.colors?.[key],
        telegramGraphColors[index % telegramGraphColors.length],
      ),
      type: String(payload.types?.[key] || "line"),
    };
  });
  const rows = xColumn
    .slice(1)
    .map((xValue, index) => {
      const timestamp = toChartTimestamp(xValue);
      if (timestamp == null) return null;
      const row: Record<string, string | number> & { timestamp: number } = {
        timestamp,
      };
      for (const column of valueColumns) {
        const value = Number(column[index + 1]);
        if (Number.isFinite(value)) row[String(column[0])] = value;
      }
      return row;
    })
    .filter(
      (row): row is Record<string, string | number> & { timestamp: number } =>
        row != null,
    );

  return rows.length ? { rows, series } : null;
}

function hasRenderableTelegramChart(
  chart: TelegramGraphChartData | null,
): chart is TelegramGraphChartData {
  if (!chart?.rows.length || !chart.series.length) return false;
  return chart.rows.some((row) =>
    chart.series.some((series) => Number.isFinite(Number(row[series.key]))),
  );
}

export function hasRenderableTelegramGraphItem<
  T extends { chart: TelegramGraphChartData | null },
>(item: T): item is T & { chart: TelegramGraphChartData } {
  return hasRenderableTelegramChart(item.chart);
}

function normalizeTelegramColor(value: unknown, fallback: string) {
  const match = String(value || "").match(/#[0-9a-f]{6}/i);
  return match?.[0] || fallback;
}

export function MtprotoGraphChart({ chart }: { chart: TelegramGraphChartData }) {
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
      <TelegramGraphLegend series={chart.series} />
    </div>
  );
}

function TelegramGraphLegend({
  series,
}: {
  series: TelegramGraphChartData["series"];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 px-1 pb-1">
      {series.map((item) => (
        <span
          key={item.key}
          className="rounded-md px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
          style={{ backgroundColor: item.color }}
        >
          {item.name}
        </span>
      ))}
    </div>
  );
}
