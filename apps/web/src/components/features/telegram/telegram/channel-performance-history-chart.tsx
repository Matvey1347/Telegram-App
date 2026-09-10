import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TelegramChannelPerformanceHistoryPoint } from "@telegram-system/shared";

type ChartMetric =
  | "subscribers"
  | "averageViews"
  | "paybackPercent"
  | "adsLeft";

export function ChannelPerformanceHistoryCharts({
  points,
}: {
  points: TelegramChannelPerformanceHistoryPoint[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <HistoryChart
        title="Subscribers"
        description="Recorded audience snapshots. The scale follows the observed range so gains, losses and same-day spikes remain visible."
        metric="subscribers"
        color="#a78bfa"
        points={points}
        focusedScale
      />
      <HistoryChart
        title="24h average post reach"
        description="Average adjusted views measured at the same post age: approximately 24 hours after publication."
        metric="averageViews"
        color="#38bdf8"
        points={points}
        focusedScale
        smooth
      />
      <HistoryChart
        title="Ads left"
        description="Unrecovered spend divided by the estimated ad price. Ad price follows 24h post reach at the channel CPM."
        metric="adsLeft"
        color="#22d3ee"
        points={points}
        focusedScale
      />
      <HistoryChart
        title="Payback"
        description="Cumulative received advertising revenue as a share of actual channel spend."
        metric="paybackPercent"
        color="#fbbf24"
        points={points}
        percentAxis
      />
    </div>
  );
}

function HistoryChart({
  title,
  description,
  metric,
  color,
  points,
  percentAxis = false,
  focusedScale = false,
  smooth = false,
}: {
  title: string;
  description: string;
  metric: ChartMetric;
  color: string;
  points: TelegramChannelPerformanceHistoryPoint[];
  percentAxis?: boolean;
  focusedScale?: boolean;
  smooth?: boolean;
}) {
  const chartPoints = points.filter((point) => point[metric] != null);
  const domain = focusedScale ? focusedDomain(chartPoints, metric) : undefined;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-300">
        {title}
      </p>
      <p className="mt-1 min-h-8 text-[11px] leading-4 text-neutral-500">
        {description}
      </p>
      {chartPoints.length ? (
        <>
          <p className="mt-1 text-[10px] text-neutral-600">
            Data available from {fullDate(chartPoints[0].date)}
          </p>
          <div className="mt-2 h-48 min-h-48 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartPoints}
                margin={{ top: 6, right: 8, left: -8, bottom: 0 }}
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
                  domain={domain}
                  allowDataOverflow={Boolean(domain)}
                  stroke="#737373"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) =>
                    percentAxis
                      ? `${compactNumber(value)}%`
                      : compactNumber(value)
                  }
                  width={52}
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
                <Area
                  type={smooth ? "monotone" : "linear"}
                  dataKey={metric}
                  name={title}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.14}
                  strokeWidth={2.5}
                  dot={chartPoints.length < 3 ? { r: 3 } : false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="flex h-48 items-center justify-center px-6 text-center text-xs text-neutral-500">
          No measured data in this period. The chart begins with the first real
          observation instead of drawing an empty timeline.
        </div>
      )}
    </div>
  );
}

function focusedDomain(
  points: TelegramChannelPerformanceHistoryPoint[],
  metric: ChartMetric,
): [number, number] | undefined {
  const values = points
    .map((point) => point[metric])
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (!values.length) return undefined;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum;
  const padding = Math.max(spread * 0.18, Math.abs(maximum) * 0.008, 1);
  return [Math.max(0, minimum - padding), maximum + padding];
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
