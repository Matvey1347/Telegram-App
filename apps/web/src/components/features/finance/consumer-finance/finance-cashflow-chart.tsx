"use client";

import { useState } from "react";
import type { ConsumerFinanceAnalytics } from "@telegram-system/shared";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import type { FinanceLocale } from "./i18n/core";
import { financeAnalyticsCopy } from "./i18n/analytics";

export function CashflowChart({
  data,
  locale,
  label,
}: {
  data: ConsumerFinanceAnalytics;
  locale: FinanceLocale;
  label: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const copy = financeAnalyticsCopy(locale);
  const width = 760;
  const height = 260;
  const pad = { left: 92, right: 22, top: 20, bottom: 38 };
  const series = [
    {
      label: copy.income,
      color: "#34d399",
      value: (point: ConsumerFinanceAnalytics["timeline"][number]) =>
        Number(point.income),
    },
    {
      label: copy.expense,
      color: "#fb7185",
      value: (point: ConsumerFinanceAnalytics["timeline"][number]) =>
        Number(point.expenses),
    },
    {
      label: copy.invested,
      color: "#a78bfa",
      value: (point: ConsumerFinanceAnalytics["timeline"][number]) =>
        Number(point.invested),
    },
    {
      label: copy.debtRepayments,
      color: "#fbbf24",
      value: (point: ConsumerFinanceAnalytics["timeline"][number]) =>
        Number(point.debtRepayments ?? "0"),
    },
  ];
  const bound = Math.max(
    ...series.flatMap((item) => data.timeline.map(item.value)),
    1,
  );
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (index: number) =>
    data.timeline.length === 1
      ? pad.left + plotWidth / 2
      : pad.left + (plotWidth * index) / (data.timeline.length - 1);
  const y = (amount: number) =>
    pad.top + plotHeight - (amount / bound) * plotHeight;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(
      new Date(`${value}T12:00:00`),
    );
  const labelIndexes = new Set([
    0,
    Math.floor((data.timeline.length - 1) / 2),
    data.timeline.length - 1,
  ]);
  const hoveredPoint =
    hoveredIndex === null ? null : data.timeline[hoveredIndex];

  return (
    <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
      <div className="relative">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-h-56 w-full"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {[bound, bound / 2, 0].map((tick) => {
            const tickY = y(tick);
            return (
              <g key={tick}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={tickY}
                  y2={tickY}
                  stroke="rgb(64 64 64)"
                  strokeDasharray="4 5"
                />
                <text
                  x={pad.left - 10}
                  y={tickY + 4}
                  textAnchor="end"
                  fill="rgb(163 163 163)"
                  fontSize="11"
                >
                  {formatMoney(tick.toFixed(0), data.currency, "symbol")}
                </text>
              </g>
            );
          })}
          {series.map((item) => (
            <g key={item.label}>
              <path
                d={data.timeline
                  .map(
                    (point, index) =>
                      `${index ? "L" : "M"} ${x(index)} ${y(item.value(point))}`,
                  )
                  .join(" ")}
                fill="none"
                stroke={item.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {data.timeline.map((point, index) => (
                <circle
                  key={point.date}
                  cx={x(index)}
                  cy={y(item.value(point))}
                  r={hoveredIndex === index ? 5 : 2.75}
                  fill={item.color}
                  stroke="rgb(10 10 10)"
                  strokeWidth="2"
                  className="pointer-events-none transition-[r]"
                />
              ))}
            </g>
          ))}
          {hoveredIndex !== null ? (
            <line
              x1={x(hoveredIndex)}
              x2={x(hoveredIndex)}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="rgb(163 163 163)"
              strokeDasharray="3 4"
            />
          ) : null}
          {data.timeline.map((point, index) => {
            const pointX = x(index);
            const hitStart =
              index === 0 ? pad.left : (x(index - 1) + pointX) / 2;
            const hitEnd =
              index === data.timeline.length - 1
                ? width - pad.right
                : (pointX + x(index + 1)) / 2;
            return (
              <g key={point.date}>
                {labelIndexes.has(index) ? (
                  <text
                    x={pointX}
                    y={height - 14}
                    textAnchor={
                      index === 0
                        ? "start"
                        : index === data.timeline.length - 1
                          ? "end"
                          : "middle"
                    }
                    fill="rgb(163 163 163)"
                    fontSize="11"
                  >
                    {date(point.date)}
                  </text>
                ) : null}
                <rect
                  x={hitStart}
                  y={pad.top}
                  width={hitEnd - hitStart}
                  height={plotHeight}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${point.date}: ${label}`}
                  className="cursor-crosshair focus:outline-none"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={() => setHoveredIndex(null)}
                />
              </g>
            );
          })}
        </svg>
        {hoveredPoint && hoveredIndex !== null ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-neutral-700 bg-neutral-950/95 p-2 text-[11px] shadow-xl"
            style={{
              left: `${(x(hoveredIndex) / width) * 100}%`,
              transform:
                x(hoveredIndex) > width / 2
                  ? "translateX(calc(-100% - 8px))"
                  : "translateX(8px)",
            }}
          >
            <p className="mb-1 font-medium text-neutral-200">
              {date(hoveredPoint.date)}
            </p>
            {series.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4"
              >
                <span className="flex items-center gap-1.5 text-neutral-300">
                  <i
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.label}
                </span>
                <span className="tabular-nums text-neutral-100">
                  {formatMoney(
                    item.value(hoveredPoint).toFixed(2),
                    data.currency,
                    "symbol",
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-2 grid gap-1 border-t border-neutral-800 pt-2 text-[11px] text-neutral-300 sm:grid-cols-2 xl:grid-cols-4">
        {series.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <i
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
