"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ConsumerFinanceAnalyticsPeriod,
  ConsumerFinanceAnalyticsQuery,
} from "@telegram-system/shared";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState } from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { formatMoney } from "@/lib/features/finance/money";
import { consumerFinanceKeys } from "@/lib/query-keys";

const PERIODS: Array<{ value: ConsumerFinanceAnalyticsPeriod; label: string }> = [
  { value: "CURRENT_MONTH", label: "This month" },
  { value: "PREVIOUS_MONTH", label: "Last month" },
  { value: "LAST_3_MONTHS", label: "3 months" },
  { value: "CUSTOM", label: "Custom" },
];

export function FinanceAnalytics({ botId }: { botId: string }) {
  const [period, setPeriod] = useState<ConsumerFinanceAnalyticsPeriod>("CURRENT_MONTH");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query: ConsumerFinanceAnalyticsQuery =
    period === "CUSTOM" ? { period, from, to } : { period };
  const analytics = useQuery({
    queryKey: consumerFinanceKeys.analytics(botId, query),
    queryFn: () => consumerFinanceApi.analytics(botId, query),
    // Analytics is only refreshed by an explicit period change or relevant mutation.
    enabled: period !== "CUSTOM" || Boolean(from && to),
  });
  return (
    <Card>
      <h2 className="font-medium">Cashflow</h2>
      <div className="mt-2 flex flex-wrap gap-1" aria-label="Analytics period">
        {PERIODS.map((item) => (
          <Button key={item.value} variant={period === item.value ? "primary" : "secondary"} onClick={() => setPeriod(item.value)}>
            {item.label}
          </Button>
        ))}
      </div>
      {period === "CUSTOM" ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input aria-label="Analytics start date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input aria-label="Analytics end date" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
      ) : null}
      {analytics.isLoading ? <LoadingState text="Loading analytics…" /> : null}
      {analytics.isError ? <ErrorState text="Could not load analytics." /> : null}
      {analytics.data ? <AnalyticsPresentation data={analytics.data} /> : null}
    </Card>
  );
}

export function AnalyticsPresentation({ data }: { data: Awaited<ReturnType<typeof consumerFinanceApi.analytics>> }) {
  const maximum = Math.max(...data.expensesByCategory.map((item) => Number(item.amount)), 1);
  return <div className="mt-3 space-y-3">
    <div className="grid grid-cols-3 gap-2 text-xs">
      <Metric label="Income" value={data.summary.income} currency={data.currency} tone="text-emerald-300" />
      <Metric label="Expenses" value={data.summary.expenses} currency={data.currency} tone="text-rose-300" />
      <Metric label="Net" value={data.summary.netCashflow} currency={data.currency} tone="text-sky-200" />
    </div>
    {data.legacyFallback ? (
      <div
        role="note"
        className="rounded border border-amber-700/60 bg-amber-950/30 p-2 text-xs text-amber-100"
      >
        <p className="font-medium">Some historical transactions are not included in these totals.</p>
        <p className="mt-1 text-amber-100/80">
          {data.legacyFallback.transactionCount} transaction{data.legacyFallback.transactionCount === 1 ? "" : "s"} predates currency valuation, so it cannot be compared safely with {data.currency}.
        </p>
        {data.legacyFallback.nativeAmounts.length ? (
          <ul className="mt-2 space-y-1 border-t border-amber-700/40 pt-2" aria-label="Historical native currency amounts">
            {data.legacyFallback.nativeAmounts.map((bucket) => (
              <li key={bucket.currency} className="flex justify-between gap-2">
                <span>Historical native amount</span>
                <span>{formatMoney(bucket.amount, bucket.currency, "symbol")}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : null}
    <div>
      <p className="mb-1 text-xs text-neutral-500">Expenses by category</p>
      {data.expensesByCategory.length ? data.expensesByCategory.slice(0, 5).map((item) => (
        <div key={item.categoryId ?? item.name} className="mb-2">
          <div className="flex justify-between gap-2 text-xs"><span className="truncate">{item.name}</span><span>{formatMoney(item.amount, data.currency, "symbol")} · {item.percentage}%</span></div>
          <div className="mt-1 h-1.5 rounded bg-neutral-800"><div className="h-1.5 rounded bg-rose-400" style={{ width: `${Math.min(100, Number(item.amount) / maximum * 100)}%` }} /></div>
        </div>
      )) : <EmptyState text="Expenses will appear here." />}
    </div>
    {data.timeline.length ? <div className="flex h-12 items-end gap-1" aria-label="Cashflow timeline">
      {data.timeline.map((point) => {
        const amount = Number(point.netCashflow);
        const max = Math.max(...data.timeline.map((entry) => Math.abs(Number(entry.netCashflow))), 1);
        return <div key={point.date} title={`${point.date}: ${formatMoney(point.netCashflow, data.currency, "symbol")}`} className="flex h-full flex-1 items-end"><div className={amount >= 0 ? "w-full rounded-t bg-emerald-400" : "w-full rounded-t bg-rose-400"} style={{ height: `${Math.max(6, Math.abs(amount) / max * 100)}%` }} /></div>;
      })}
    </div> : null}
  </div>;
}

function Metric({ label, value, currency, tone }: { label: string; value: string; currency: string; tone: string }) {
  return <div><p className="text-neutral-500">{label}</p><p className={`truncate font-medium ${tone}`}>{formatMoney(value, currency, "symbol")}</p></div>;
}
