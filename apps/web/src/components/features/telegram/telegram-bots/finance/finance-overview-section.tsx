"use client";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BadgeDollarSign,
  CircleDollarSign,
  CreditCard,
  Cpu,
  Gift,
  ReceiptText,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import type { TelegramBotRuntimeEnvironment } from "@telegram-system/shared";
import type { BotBillingOverviewView } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { Card } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import { botBillingApi } from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";
import {
  formatBillingDate,
  formatBillingMoney,
} from "./finance-billing-format";
export function FinanceOverviewSection({
  botId,
  environment,
}: {
  botId: string;
  environment: TelegramBotRuntimeEnvironment;
}) {
  const overview = useQuery({
    queryKey: botBillingKeys.overview(botId, environment),
    queryFn: () => botBillingApi.overview(botId, environment),
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
        <Metric
          icon={UsersRound}
          emoji="👥"
          label="Registered users"
          value={analytics.registeredUsers}
        />
        <Metric
          icon={UserRoundCheck}
          emoji="💎"
          label="Paid users"
          value={analytics.paidUsers}
        />
        <Metric
          icon={CreditCard}
          emoji="💳"
          label="Active subscriptions"
          value={analytics.activeSubscriptions}
        />
        <Metric
          icon={AlertTriangle}
          emoji="⚠️"
          label="Failed payments"
          value={analytics.failedPayments}
          attention={analytics.failedPayments > 0}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          icon={Gift}
          emoji="🎁"
          label="Free users"
          value={analytics.freeUsers}
        />
        <Metric
          icon={TrendingUp}
          emoji="📈"
          label="Conversion"
          value={`${conversion.toFixed(1)}%`}
        />
        <Metric
          icon={ReceiptText}
          emoji="🗓️"
          label="Monthly subscribers"
          value={analytics.monthly}
        />
        <Metric
          icon={BadgeDollarSign}
          emoji="📆"
          label="Yearly subscribers"
          value={analytics.yearly}
        />
        <Metric
          icon={CircleDollarSign}
          emoji="⛔"
          label="Canceled"
          value={analytics.canceled}
        />
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
      <AiUsagePanel data={data.aiUsage} />
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

function formatAiCost(micros: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: micros < 10_000 ? 4 : 2, maximumFractionDigits: 6 }).format(micros / 1_000_000);
}

function AiUsagePanel({ data }: { data: BotBillingOverviewView["aiUsage"] }) {
  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-sky-300"><Cpu size={20} /></div><div><h2 className="font-semibold text-white">AI usage · current month</h2><p className="text-xs text-neutral-500">Actual provider usage for this bot and selected runtime</p></div></div><p className="text-xl font-semibold tabular-nums text-white">{formatAiCost(data.estimatedCostMicros)}</p></div><div className="mt-4 grid gap-2 sm:grid-cols-4">{[["Requests", data.requests.toLocaleString()], ["Input tokens", data.inputTokens.toLocaleString()], ["Cached input", data.cachedInputTokens.toLocaleString()], ["Output tokens", data.outputTokens.toLocaleString()]].map(([label, value]) => <div key={label} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 font-medium tabular-nums text-white">{value}</p></div>)}</div>{data.unpricedRequests ? <p className="mt-3 text-xs text-amber-300">{data.unpricedRequests} request(s) use a model without a pricing snapshot and are excluded from cost.</p> : null}<div className="mt-4 grid gap-4 xl:grid-cols-2"><UsageTable title="By model" rows={data.byModel.map((row) => ({ key: row.model, label: row.model, detail: `${row.requests} requests · ${(row.inputTokens + row.outputTokens).toLocaleString()} tokens`, cost: row.estimatedCostMicros }))} /><UsageTable title="By user" rows={data.byUser.map((row) => ({ key: row.telegramBotUserId, label: row.username ? `@${row.username}` : row.firstName || row.telegramUserId, detail: `${row.requests} requests · Telegram ${row.telegramUserId}`, cost: row.estimatedCostMicros }))} /></div></Card>;
}

function UsageTable({ title, rows }: { title: string; rows: Array<{ key: string; label: string; detail: string; cost: number }> }) {
  return <div><h3 className="text-sm font-medium text-neutral-300">{title}</h3>{rows.length ? <div className="mt-2 divide-y divide-neutral-800 rounded-lg border border-neutral-800">{rows.map((row) => <div key={row.key} className="flex items-center justify-between gap-3 p-3 text-sm"><div className="min-w-0"><p className="truncate text-white">{row.label}</p><p className="truncate text-xs text-neutral-500">{row.detail}</p></div><span className="shrink-0 tabular-nums text-neutral-200">{formatAiCost(row.cost)}</span></div>)}</div> : <p className="mt-2 text-sm text-neutral-500">No AI requests yet.</p>}</div>;
}
function Metric({
  label,
  value,
  attention = false,
  icon: Icon,
  emoji,
}: {
  label: string;
  value: number | string;
  attention?: boolean;
  icon: typeof AlertTriangle;
  emoji: string;
}) {
  return (
    <Card
      className={`flex items-center gap-3 p-3 ${attention ? "border-amber-700/70" : ""}`}
    >
      <IconAvatar
        icon={{ type: "unicode", value: emoji }}
        label={label}
        size="md"
      />
      <div className="min-w-0">
        <p className="truncate text-xs text-neutral-500">{label}</p>
        <p
          className={`mt-0.5 flex items-center gap-1.5 text-xl font-semibold ${attention ? "text-amber-300" : "text-white"}`}
        >
          {attention ? <Icon size={15} aria-hidden /> : null}
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
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
