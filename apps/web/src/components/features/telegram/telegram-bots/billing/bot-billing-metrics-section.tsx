"use client";

import { useQuery } from "@tanstack/react-query";
import type { BotBillingAnalyticsView } from "@telegram-system/shared";
import { Card } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import { botBillingApi } from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";

export function BotBillingMetricsSection({ botId }: { botId: string }) {
  const analytics = useQuery({
    queryKey: botBillingKeys.analytics(botId),
    queryFn: () => botBillingApi.analytics(botId),
  });
  return (
    <QueryContentState
      isLoading={analytics.isLoading}
      isError={analytics.isError}
      isEmpty={!analytics.data}
      loadingText="Loading billing statistics"
      errorText="Failed to load billing statistics."
      emptyText="Billing statistics are unavailable"
      onRetry={() => void analytics.refetch()}
    >
      {analytics.data ? <BillingMetrics data={analytics.data} /> : null}
    </QueryContentState>
  );
}

export function BillingMetrics({ data }: { data: BotBillingAnalyticsView }) {
  const counts = [
    ["Users", data.registeredUsers],
    ["Free users", data.freeUsers],
    ["Paid users", data.paidUsers],
    ["Active subscriptions", data.activeSubscriptions],
    ["Canceled subscriptions", data.canceled],
    ["Failed payments", data.failedPayments],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {counts.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase text-neutral-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {value.toLocaleString()}
            </p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <MoneyCard
          title="MRR"
          description="Contracted monthly recurring revenue"
          rows={data.mrr}
        />
        <MoneyCard
          title="Revenue"
          description="Successfully collected payments"
          rows={data.collectedRevenue}
        />
      </div>
    </div>
  );
}

function MoneyCard({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<{ currency: string | null; amountMinor: number }>;
}) {
  return (
    <Card>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-neutral-500">{description}</p>
      {rows.length ? (
        <div className="mt-4 space-y-2">
          {rows.map((row, index) => (
            <div
              key={`${row.currency || "unknown"}:${index}`}
              className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-2 last:border-0"
            >
              <span className="text-sm text-neutral-400">
                {row.currency || "Unknown currency"}
              </span>
              <span className="font-medium text-white">
                {formatMinor(row.amountMinor, row.currency)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-400">No payments yet.</p>
      )}
    </Card>
  );
}

export function formatMinor(amountMinor: number, currency: string | null) {
  if (!currency) return `${amountMinor.toLocaleString()} minor units`;
  if (currency === "XTR") return `${amountMinor.toLocaleString()} XTR`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toLocaleString()} ${currency}`;
  }
}
