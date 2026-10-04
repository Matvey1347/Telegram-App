"use client";

import { useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ConsumerFinanceAnalytics } from "@telegram-system/shared";
import { EmptyState } from "./ui";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import type { FinanceLocale } from "./i18n/core";
import { financeAnalyticsCopy } from "./i18n/analytics";
import { localizeFinanceCategory } from "./finance-category-i18n";
import { IconAvatar } from "./ui/finance-icon-avatar";
import { CashflowChart } from "./finance-cashflow-chart";

export function AnalyticsPresentation({
  data,
  locale = "en",
}: {
  data: ConsumerFinanceAnalytics;
  locale?: FinanceLocale;
}) {
  const t = financeAnalyticsCopy(locale);
  const accountRows = data.accounts.filter((account) =>
    [
      account.income,
      account.expenses,
      account.invested,
      account.investmentReturns,
      account.netCashflow,
    ].some((value) => Number(value) !== 0),
  );
  const trends = data.trends.filter(
    (trend) => Number(trend.previous) !== 0 || Number(trend.current) !== 0,
  );
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-9">
        {[
          [t.income, data.summary.income, data.currency, "text-emerald-300"],
          [t.expense, data.summary.expenses, data.currency, "text-rose-300"],
          [t.saved, data.summary.saved, data.currency, "text-sky-200"],
          [t.invested, data.summary.invested, data.currency, "text-violet-200"],
          [t.investmentReturns, data.summary.investmentReturns, data.currency, "text-emerald-200"],
          [t.net, data.summary.netCashflow, data.currency, "text-sky-200"],
          [t.savingsSummary, data.savings.allocated, data.savings.currency, "text-sky-200"],
          [t.investmentValue, data.investments.currentValue, data.investments.currency, "text-violet-200"],
          [t.netWorth, data.netWorth.amount, data.netWorth.currency, "text-emerald-200"],
        ].filter(([, value]) => Number(value) !== 0).map(([label, value, currency, tone]) => (
          <Metric key={label} label={label} value={String(value)} currency={currency} tone={tone} />
        ))}
      </div>
      <p className="text-[10px] text-neutral-500">
        {t.net}: {t.netExplanation}
      </p>
      <div className="grid gap-2 lg:grid-cols-3">
        <DonutBreakdown
          title={t.expensesByCategory}
          currency={data.currency}
          rows={data.expensesByCategory.slice(0, 6).map((row) => ({
            label:
              row.categoryId || row.categoryKey
                ? localizeFinanceCategory(row.name, row.categoryKey, locale)
                : t.other,
            value: Number(row.amount),
          }))}
          empty={t.expensesAppear}
        />
        <DonutBreakdown
          title={t.expensePriority}
          currency={data.currency}
          rows={[
            {
              label: t.requiredExpenses,
              value: Number(data.summary.requiredExpenses ?? 0),
            },
            {
              label: t.discretionaryExpenses,
              value: Number(data.summary.discretionaryExpenses ?? 0),
            },
            {
              label: t.unspecifiedExpenses,
              value: Number(data.summary.unspecifiedExpenses ?? 0),
            },
          ]}
          empty={t.expensesAppear}
        />
        <DonutBreakdown
          title={t.expenseRhythm}
          currency={data.currency}
          rows={[
            {
              label: t.recurringExpenses,
              value: Number(data.summary.recurringExpenses ?? 0),
            },
            {
              label: t.oneOffExpenses,
              value: Number(data.summary.oneOffExpenses ?? 0),
            },
          ]}
          empty={t.expensesAppear}
        />
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <DonutBreakdown
          title={t.moneyAllocation}
          currency={data.currency}
          rows={[
            { label: t.expense, value: Number(data.summary.expenses) },
            { label: t.saved, value: Number(data.summary.saved) },
            { label: t.invested, value: Number(data.summary.invested) },
          ]}
          empty={t.timelineAppear}
          horizontal
        />
        <section className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-3">
          <h3 className="text-sm font-medium">{t.moneyMovementCurve}</h3>
          {data.timeline.length ? (
            <CashflowChart
              data={data}
              locale={locale}
              label={t.moneyMovementCurve}
            />
          ) : (
            <EmptyState text={t.timelineAppear} compact />
          )}
        </section>
      </div>
      <section>
        <h3 className="text-sm font-medium">{t.periodComparison}</h3>
        {data.comparison.legacyFallback ? (
          <p role="note" className="mt-1 text-xs text-amber-300">
            {t.comparisonHistoricalExcluded}
          </p>
        ) : null}
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {trends.map((trend) => (
            <div
              key={trend.metric}
              className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2 text-xs"
            >
              <p className="text-neutral-400">{trendLabel(trend.metric, t)}</p>
              <p className="mt-1 font-medium tabular-nums">
                {trend.changePercent === null
                  ? t.noComparisonBaseline
                  : `${trend.changePercent > 0 ? "+" : ""}${trend.changePercent}%`}
              </p>
              <p className="mt-1 text-neutral-500">
                {formatMoney(trend.previous, data.currency, "symbol")} →{" "}
                {formatMoney(trend.current, data.currency, "symbol")}
              </p>
            </div>
          ))}
        </div>
      </section>
      {data.legacyFallback ? (
        <LegacyNotice data={data} locale={locale} />
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <CategoryBreakdown
          title={t.incomeByCategory}
          empty={t.incomeAppear}
          rows={data.incomeByCategory}
          currency={data.currency}
          locale={locale}
          tone="bg-emerald-400"
        />
      </div>
      <section>
        <h3 className="text-sm font-medium">{t.accountBreakdown}</h3>
        {accountRows.length ? (
          <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-neutral-950/70 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left">{t.account}</th>
                  <th className="px-3 py-2 text-right">{t.income}</th>
                  <th className="px-3 py-2 text-right">{t.expense}</th>
                  <th className="px-3 py-2 text-right">{t.invested}</th>
                  <th className="px-3 py-2 text-right">
                    {t.investmentReturns}
                  </th>
                  <th className="px-3 py-2 text-right">{t.net}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {accountRows.map((account) => (
                  <tr key={account.accountId}>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <IconAvatar
                          icon={account.iconPresentation}
                          label={account.name}
                          size="xs"
                        />
                        <span>{account.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">
                      {formatNonZeroMoney(account.income, data.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-300">
                      {formatNonZeroMoney(account.expenses, data.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-violet-200">
                      {formatNonZeroMoney(account.invested, data.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-200">
                      {formatNonZeroMoney(
                        account.investmentReturns,
                        data.currency,
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNonZeroMoney(
                        account.netCashflow,
                        data.currency,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text={t.accountsAppear} />
        )}
      </section>
    </div>
  );
}

function formatNonZeroMoney(value: string | number, currency: string) {
  return Number(value) === 0 ? "—" : formatMoney(value, currency, "symbol");
}

const DONUT_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#fb7185",
  "#fbbf24",
  "#818cf8",
];

const DONUT_CENTER = 21;
const DONUT_OUTER_RADIUS = 18.5;
const DONUT_INNER_RADIUS = 11.5;

function donutPoint(radius: number, angle: number) {
  return {
    x: DONUT_CENTER + Math.cos(angle) * radius,
    y: DONUT_CENTER + Math.sin(angle) * radius,
  };
}

function donutSegmentPath(startPercent: number, sharePercent: number) {
  const startAngle = (startPercent / 100) * Math.PI * 2 - Math.PI / 2;
  const endAngle =
    ((startPercent + sharePercent) / 100) * Math.PI * 2 - Math.PI / 2;
  const outerStart = donutPoint(DONUT_OUTER_RADIUS, startAngle);
  const outerEnd = donutPoint(DONUT_OUTER_RADIUS, endAngle);
  const innerStart = donutPoint(DONUT_INNER_RADIUS, startAngle);
  const innerEnd = donutPoint(DONUT_INNER_RADIUS, endAngle);
  const largeArc = sharePercent > 50 ? 1 : 0;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${DONUT_OUTER_RADIUS} ${DONUT_OUTER_RADIUS} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${DONUT_INNER_RADIUS} ${DONUT_INNER_RADIUS} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function DonutBreakdown({
  title,
  rows,
  currency,
  empty,
  horizontal = false,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
  currency: string;
  empty: string;
  horizontal?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<CSSProperties | null>(
    null,
  );
  const donutRef = useRef<HTMLDivElement>(null);
  const visible = rows.filter((row) => row.value > 0);
  const total = visible.reduce((sum, row) => sum + row.value, 0);
  const hoveredShare =
    hovered === null ? 0 : (visible[hovered].value / total) * 100;
  const showTooltip = (index: number) => {
    setHovered(index);
    if (!donutRef.current) return;
    const rect = donutRef.current.getBoundingClientRect();
    const opensAbove = rect.bottom + 56 > window.innerHeight;
    setTooltipPosition({
      position: "fixed" as const,
      zIndex: 100,
      left: Math.min(
        Math.max(12, rect.left + rect.width / 2),
        window.innerWidth - 12,
      ),
      top: opensAbove ? rect.top - 8 : rect.bottom + 8,
      maxWidth: "calc(100vw - 24px)",
      transform: opensAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)",
    });
  };
  const hideTooltip = () => {
    setHovered(null);
    setTooltipPosition(null);
  };
  if (!total)
    return (
      <section className="rounded-lg border border-neutral-800 p-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <EmptyState text={empty} compact />
      </section>
    );
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/30 p-3">
      <div>
        <h3 className="mb-2 text-sm font-medium">{title}</h3>
        <div
          ref={donutRef}
          className={`relative mx-auto overflow-visible ${horizontal ? "h-56 w-56" : "h-48 w-48"}`}
        >
          <svg
            viewBox="-3 -3 48 48"
            className="h-full w-full overflow-visible"
            role="img"
            aria-label={title}
          >
            <circle
              cx={DONUT_CENTER}
              cy={DONUT_CENTER}
              r={(DONUT_OUTER_RADIUS + DONUT_INNER_RADIUS) / 2}
              fill="none"
              stroke="#262626"
              strokeWidth="7"
            />
            {visible.map((row, index) => {
              const share = (row.value / total) * 100;
              const start = visible
                .slice(0, index)
                .reduce((sum, item) => sum + (item.value / total) * 100, 0);
              const interaction = {
                "aria-label": `${row.label}: ${formatMoney(row.value.toFixed(2), currency, "symbol")}`,
                fillOpacity: hovered === null || hovered === index ? 1 : 0.72,
                className:
                  "cursor-pointer transition-opacity duration-150 focus:outline-none",
                tabIndex: 0,
                onMouseEnter: () => showTooltip(index),
                onMouseLeave: hideTooltip,
                onFocus: () => showTooltip(index),
                onBlur: hideTooltip,
              };
              // A solid annular path has exact shared edges. Stroke dashes use
              // fractional circumference values and visibly tear at their joins.
              return visible.length === 1 ? (
                <circle
                  key={row.label}
                  cx={DONUT_CENTER}
                  cy={DONUT_CENTER}
                  r={(DONUT_OUTER_RADIUS + DONUT_INNER_RADIUS) / 2}
                  fill="none"
                  stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
                  strokeWidth="7"
                  strokeOpacity={interaction.fillOpacity}
                  {...interaction}
                />
              ) : (
                <path
                  key={row.label}
                  d={donutSegmentPath(start, share)}
                  fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                  {...interaction}
                />
              );
            })}
          </svg>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
            100%
          </span>
          {hovered !== null &&
          tooltipPosition &&
          typeof document !== "undefined"
            ? createPortal(
                <div
                  role="tooltip"
                  className="pointer-events-none rounded-lg border bg-neutral-950/95 px-2.5 py-1.5 text-xs shadow-xl"
                  style={{
                    borderColor: DONUT_COLORS[hovered % DONUT_COLORS.length],
                    ...tooltipPosition,
                  }}
                >
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        DONUT_COLORS[hovered % DONUT_COLORS.length],
                    }}
                  />
                  <span
                    className="font-medium"
                    style={{
                      color: DONUT_COLORS[hovered % DONUT_COLORS.length],
                    }}
                  >
                    {visible[hovered].label}
                  </span>
                  <span
                    className="ml-1.5 tabular-nums"
                    style={{
                      color: DONUT_COLORS[hovered % DONUT_COLORS.length],
                    }}
                  >
                    {formatMoney(
                      visible[hovered].value.toFixed(2),
                      currency,
                      "symbol",
                    )}
                  </span>
                  <span
                    className="ml-1"
                    style={{
                      color: DONUT_COLORS[hovered % DONUT_COLORS.length],
                    }}
                  >
                    · {hoveredShare.toFixed(1)}%
                  </span>
                </div>,
                document.body,
              )
            : null}
        </div>
      </div>
      <div
        className={`mx-auto mt-3 grid min-w-0 gap-1.5 ${horizontal ? "w-full max-w-lg" : "w-full"}`}
      >
        {visible.map((row, index) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-neutral-300">
              <i
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{
                  backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length],
                }}
              />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-neutral-400">
              {formatMoney(row.value.toFixed(2), currency, "symbol")} ·{" "}
              {Math.round((row.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: string;
  currency: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2">
      <p
        title={label}
        className="truncate whitespace-nowrap text-[10px] text-neutral-500"
      >
        {label}
      </p>
      <p className={`truncate text-sm font-medium tabular-nums ${tone}`}>
        {formatMoney(value, currency, "symbol")}
      </p>
    </div>
  );
}

function CategoryBreakdown({
  title,
  empty,
  rows,
  currency,
  locale,
  tone,
}: {
  title: string;
  empty: string;
  rows: ConsumerFinanceAnalytics["expensesByCategory"];
  currency: string;
  locale: FinanceLocale;
  tone: string;
}) {
  const t = financeAnalyticsCopy(locale);
  const maximum = Math.max(...rows.map((item) => Number(item.amount)), 1);
  return (
    <section>
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length ? (
        <div className="mt-2 space-y-2">
          {rows.slice(0, 8).map((item) => (
            <div key={item.categoryId ?? item.name}>
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate">
                  {item.categoryId || item.categoryKey
                    ? localizeFinanceCategory(
                        item.name,
                        item.categoryKey,
                        locale,
                      )
                    : t.other}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(item.amount, currency, "symbol")} ·{" "}
                  {item.percentage}%
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-neutral-800">
                <div
                  className={`h-1.5 rounded ${tone}`}
                  style={{
                    width: `${Math.min(100, (Number(item.amount) / maximum) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text={empty} />
      )}
    </section>
  );
}

function LegacyNotice({
  data,
  locale,
}: {
  data: ConsumerFinanceAnalytics;
  locale: FinanceLocale;
}) {
  const t = financeAnalyticsCopy(locale);
  const fallback = data.legacyFallback!;
  return (
    <div
      role="note"
      className="rounded border border-amber-700/60 bg-amber-950/30 p-2 text-xs text-amber-100"
    >
      <p className="font-medium">{t.historicalExcluded}</p>
      <p className="mt-1 text-amber-100/80">
        {fallback.transactionCount} {t.historicalReason} {data.currency}.
      </p>
      {fallback.nativeAmounts.length ? (
        <ul
          className="mt-2 space-y-1 border-t border-amber-700/40 pt-2"
          aria-label={t.historicalAmounts}
        >
          {fallback.nativeAmounts.map((bucket) => (
            <li key={bucket.currency} className="flex justify-between gap-2">
              <span>{t.historicalAmount}</span>
              <span>
                {formatMoney(bucket.amount, bucket.currency, "symbol")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function trendLabel(
  metric: ConsumerFinanceAnalytics["trends"][number]["metric"],
  copy: ReturnType<typeof financeAnalyticsCopy>,
) {
  return metric === "INCOME"
    ? copy.incomeTrend
    : metric === "EXPENSES"
      ? copy.expenseTrend
      : metric === "SAVED"
        ? copy.savedTrend
        : metric === "INVESTED"
          ? copy.investedTrend
          : metric === "INVESTMENT_RETURNS"
            ? copy.returnsTrend
            : copy.netTrend;
}
