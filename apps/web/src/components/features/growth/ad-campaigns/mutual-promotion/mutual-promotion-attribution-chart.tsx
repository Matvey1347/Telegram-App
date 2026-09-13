"use client";

import type { MutualPromotionAttributionHistory } from "@telegram-system/shared";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateTime } from "@/lib/date-format";

export function MutualPromotionAttributionChart({
  history,
  showUnsubscribed = true,
}: {
  history?: MutualPromotionAttributionHistory;
  showUnsubscribed?: boolean;
}) {
  if (!history || history.points.length < 2) return null;
  const chartData = history.points.map((point) => ({
    ...point,
    timestamp: new Date(point.at).getTime(),
  }));

  return (
    <div className="mt-2 border-t border-neutral-800/80 pt-2">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
        <span>Invite-link history</span>
        <span className="whitespace-nowrap">
          {formatDateTime(history.startsAt)} → {formatDateTime(history.endsAt)}
        </span>
      </div>
      <div
        className="h-20 w-full"
        aria-label={
          showUnsubscribed
            ? "Invite-link arrivals and unsubscribes chart"
            : "Invite-link arrivals chart"
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 3, right: 4, bottom: 0, left: -24 }}
          >
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) =>
                new Intl.DateTimeFormat(undefined, {
                  day: "2-digit",
                  month: "2-digit",
                }).format(new Date(Number(value)))
              }
              tick={{ fill: "#737373", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "#737373", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <Tooltip
              labelFormatter={(value) => formatDateTime(Number(value))}
              contentStyle={{
                background: "#0a0a0a",
                border: "1px solid #404040",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="joinedCount"
              name="Joined"
              stroke="#6ee7b7"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {showUnsubscribed ? (
              <Line
                type="monotone"
                dataKey="unsubscribedCount"
                name="Unsubscribed ≈"
                stroke="#fda4af"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
