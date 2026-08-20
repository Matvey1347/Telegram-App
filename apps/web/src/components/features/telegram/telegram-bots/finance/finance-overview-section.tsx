"use client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type {
  BotBillingAnalyticsView,
  BotBillingOverviewView,
} from "@telegram-system/shared";
import { Card } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import { botBillingApi } from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";
import {
  formatBillingDate,
  formatBillingMoney,
} from "./finance-billing-format";
export function FinanceOverviewSection({ botId }: { botId: string }) {
  const overview = useQuery({
    queryKey: botBillingKeys.overview(botId),
    queryFn: () => botBillingApi.overview(botId),
  });
  return (
    <QueryContentState
      isLoading={overview.isLoading}
      isError={overview.isError}
      isEmpty={!overview.data}
      loadingText="Loading billing overview"
      errorText="Could not load Finance billing overview."
      emptyText="Billing overview is unavailable"
      onRetry={() => void overview.refetch()}
    >
      {overview.data ? <Overview data={overview.data} /> : null}
    </QueryContentState>
  );
}
function Overview({ data }: { data: BotBillingOverviewView }) {
  const analytics = data.analytics;
  const conversion = analytics.registeredUsers
    ? (analytics.paidUsers / analytics.registeredUsers) * 100
    : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Registered users" value={analytics.registeredUsers} />
        <Metric label="Paid users" value={analytics.paidUsers} />
        <Metric
          label="Active subscriptions"
          value={analytics.activeSubscriptions}
        />
        <Metric
          label="Failed payments"
          value={analytics.failedPayments}
          attention={analytics.failedPayments > 0}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Free users" value={analytics.freeUsers} />
        <Metric label="Conversion" value={`${conversion.toFixed(1)}%`} />
        <Metric label="Monthly subscribers" value={analytics.monthly} />
        <Metric label="Yearly subscribers" value={analytics.yearly} />
        <Metric label="Canceled" value={analytics.canceled} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <MoneyRows
          title="MRR"
          description="Contracted monthly recurring revenue"
          rows={analytics.mrr}
        />
        <MoneyRows
          title="Collected revenue"
          description="Successful payments"
          rows={analytics.collectedRevenue}
        />
      </div>
      {data.recentActivity.length ? (
        <Card>
          <h2 className="font-semibold text-white">Recent activity</h2>
          <div className="mt-3 divide-y divide-neutral-800">
            {data.recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="text-neutral-200">
                  {item.type.replaceAll("_", " ")}
                  {item.plan ? ` · ${item.plan.name}` : ""}
                  {item.amountMinor != null
                    ? ` · ${formatBillingMoney(item.amountMinor, item.currency)}`
                    : ""}
                </span>
                <span className="text-xs text-neutral-500">
                  {formatBillingDate(item.occurredAt)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
function Metric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number | string;
  attention?: boolean;
}) {
  return (
    <Card className={attention ? "border-amber-700/70" : ""}>
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <p
        className={`mt-1 flex items-center gap-2 text-2xl font-semibold ${attention ? "text-amber-300" : "text-white"}`}
      >
        {attention ? <AlertTriangle size={18} aria-hidden /> : null}
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </Card>
  );
}
function MoneyRows({
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
      <h2 className="font-semibold text-white">{title}</h2>
      <p className="mt-1 text-xs text-neutral-500">{description}</p>
      {rows.length ? (
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div
              key={row.currency ?? "unknown"}
              className="flex justify-between border-b border-neutral-800 pb-2 text-sm last:border-0"
            >
              <span className="text-neutral-400">
                {row.currency ?? "Unknown currency"}
              </span>
              <span className="font-medium text-white">
                {formatBillingMoney(row.amountMinor, row.currency)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">No payments yet.</p>
      )}
    </Card>
  );
}
