"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  ChevronDown,
  Landmark,
  Megaphone,
  Scale,
  WalletCards,
  Repeat2,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { IconAvatar } from "@/components/icons/icon-avatar";
import {
  Button,
  Card,
  DateRangeInput,
  FormField,
  PageHeader,
  Skeleton,
} from "@/components/ui/primitives";
import { getDashboardSummary, type DashboardSummary } from "@/lib/api";
import { formatDate } from "@/lib/date-format";
import { formatMoney } from "@/lib/features/finance/money";
import { dashboardKeys } from "@/lib/query-keys";
import {
  currentCalendarMonthPeriod,
  type DashboardPeriod,
} from "./dashboard-period";

type RangeMode = "month" | "all" | "custom";
type DashboardCategory = DashboardSummary["categoryBreakdown"][number];

export function DashboardPage() {
  const defaultPeriod = useMemo(() => currentCalendarMonthPeriod(), []);
  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [customPeriod, setCustomPeriod] =
    useState<DashboardPeriod>(defaultPeriod);
  const period =
    rangeMode === "month"
      ? defaultPeriod
      : rangeMode === "custom"
        ? customPeriod
        : undefined;
  const summary = useQuery({
    queryKey: dashboardKeys.summary(
      rangeMode,
      period?.dateFrom,
      period?.dateTo,
    ),
    queryFn: () => getDashboardSummary(period),
    // Dashboard values describe one exact period. Keeping the previous
    // period visible while the next one loads makes the selected tab and the
    // displayed totals disagree, so this screen deliberately opts out of the
    // app-wide keepPreviousData default.
    placeholderData: () => undefined,
  });

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        subtitle="Telegram revenue efficiency and essential cash flow"
      />

      <PeriodFilter
        mode={rangeMode}
        customPeriod={customPeriod}
        onModeChange={setRangeMode}
        onCustomPeriodChange={setCustomPeriod}
      />

      {summary.isLoading && !summary.data ? <DashboardSkeleton /> : null}
      {summary.isError ? (
        <Card className="mt-6 flex flex-wrap items-center justify-between gap-3 border-rose-900/70 text-rose-200">
          <span>Failed to load dashboard data.</span>
          <Button variant="secondary" onClick={() => summary.refetch()}>
            Retry
          </Button>
        </Card>
      ) : null}
      {summary.data ? <DashboardOverview data={summary.data} /> : null}
    </AppShell>
  );
}

function PeriodFilter({
  mode,
  customPeriod,
  onModeChange,
  onCustomPeriodChange,
}: {
  mode: RangeMode;
  customPeriod: DashboardPeriod;
  onModeChange: (mode: RangeMode) => void;
  onCustomPeriodChange: (period: DashboardPeriod) => void;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-2">
        <Button
          variant={mode === "month" ? "primary" : "secondary"}
          onClick={() => onModeChange("month")}
        >
          <CalendarDays size={16} />
          Current month
        </Button>
        <Button
          variant={mode === "all" ? "primary" : "secondary"}
          onClick={() => onModeChange("all")}
        >
          All time
        </Button>
        <Button
          variant={mode === "custom" ? "primary" : "secondary"}
          onClick={() => onModeChange("custom")}
        >
          Custom period
        </Button>
        {mode === "custom" ? (
          <div className="w-full max-w-[420px] pt-2 sm:ml-2 sm:w-auto sm:min-w-[360px] sm:pt-0">
            <FormField label="Period">
              <DateRangeInput
                from={customPeriod.dateFrom}
                to={customPeriod.dateTo}
                onChange={({ from, to }) =>
                  onCustomPeriodChange({ dateFrom: from, dateTo: to })
                }
              />
            </FormField>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function DashboardOverview({ data }: { data: DashboardSummary }) {
  const currency = data.primaryCurrency ?? "USD";
  const money = (value: number | null | undefined) =>
    typeof value === "number" ? formatMoney(value, currency) : "—";
  const hasAudience = Number(data.activeSubscribersEstimate) > 0;
  const incomeBreakdown = data.incomeBreakdownForPeriod ?? {
    channels: data.incomeForPeriod,
    other: 0,
  };
  const expensesBreakdown = data.expensesBreakdownForPeriod ?? {
    channels: 0,
    other: data.expensesForPeriod,
  };
  const details = data.categoryBreakdown ?? [];
  const detailGroups = (
    flow: "income" | "expense",
    bucket: "channels" | "other",
  ) => details.filter((item) => item.flow === flow && item.bucket === bucket);
  const adjustmentGroups = details.filter((item) => item.flow === "adjustment");

  return (
    <div className="mt-6 space-y-6">
      <Card className="overflow-hidden border-emerald-900/70 bg-emerald-950/20">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-300">
              <Users size={18} />
              Revenue per active subscriber
            </div>
            <div className="tabular-nums text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {data.revenuePerActiveSubscriber == null
                ? "—"
                : money(data.revenuePerActiveSubscriber)}
            </div>
          </div>
          <div className="max-w-md text-sm text-neutral-400 md:text-right">
            {hasAudience ? (
              <>
                {money(incomeBreakdown.channels)} channel revenue divided by{" "}
                {data.activeSubscribersEstimate.toLocaleString()} active
                subscribers.
              </>
            ) : (
              "Active subscriber data is required to calculate this metric."
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Cash flow</h3>
          <p className="mt-1 text-sm text-neutral-400">
            Totals for the selected period in {currency}.
          </p>
        </div>
        <div className="divide-y divide-neutral-800">
          <CashFlowRow
            icon={ArrowUpRight}
            label="Income"
            value={money(data.incomeForPeriod)}
            currency={currency}
            tone="text-emerald-300"
            breakdown={[
              {
                label: "Channels",
                value: money(incomeBreakdown.channels),
                icon: Megaphone,
                iconTone: "bg-sky-500/15 text-sky-300 ring-sky-500/25",
                details: detailGroups("income", "channels"),
              },
              {
                label: "Other (bots, etc.)",
                value: money(incomeBreakdown.other),
                icon: Bot,
                iconTone: "bg-violet-500/15 text-violet-300 ring-violet-500/25",
                details: detailGroups("income", "other"),
              },
            ]}
          />
          <CashFlowRow
            icon={ArrowDownRight}
            label="Expenses"
            value={money(data.expensesForPeriod)}
            currency={currency}
            tone="text-rose-300"
            breakdown={[
              {
                label: "Channels",
                value: money(expensesBreakdown.channels),
                icon: Megaphone,
                iconTone: "bg-sky-500/15 text-sky-300 ring-sky-500/25",
                details: detailGroups("expense", "channels"),
              },
              {
                label: "Other",
                value: money(expensesBreakdown.other),
                icon: Bot,
                iconTone: "bg-violet-500/15 text-violet-300 ring-violet-500/25",
                details: detailGroups("expense", "other"),
              },
              {
                label: "Balance adjustments",
                value: money(data.excludedBalanceAdjustmentsForPeriod),
                icon: Scale,
                iconTone: "bg-amber-500/15 text-amber-300 ring-amber-500/25",
                hint: "Excluded from cash flow",
                details: adjustmentGroups,
              },
            ]}
          />
          <CashFlowRow
            icon={Landmark}
            label="Investments"
            value={money(data.investedCapitalForPeriod)}
            currency={currency}
            tone="text-violet-300"
            capitalGroups={data.investmentBreakdownForPeriod}
            details={
              data.investmentBreakdownForPeriod?.some(
                (group) => group.movements.length,
              )
                ? undefined
                : details.filter((item) => item.flow === "investment")
            }
            breakdown={(data.investmentBreakdownForPeriod ?? []).map(
              (group) => ({
                label:
                  group.origin === "EXTERNAL"
                    ? "External capital"
                    : group.origin === "SALARY"
                      ? "Salary invested"
                      : "Reinvested profit",
                value: money(group.amount),
                icon: group.origin === "REINVESTMENT" ? Repeat2 : WalletCards,
                iconTone:
                  group.origin === "REINVESTMENT"
                    ? "bg-violet-500/15 text-violet-300 ring-violet-500/25"
                    : "bg-sky-500/15 text-sky-300 ring-sky-500/25",
              }),
            )}
          />
        </div>
      </Card>
    </div>
  );
}

function CashFlowRow({
  icon: Icon,
  label,
  value,
  currency,
  tone,
  breakdown,
  details,
  capitalGroups,
}: {
  icon: typeof ArrowUpRight;
  label: string;
  value: string;
  currency: string;
  tone: string;
  breakdown?: Array<{
    label: string;
    value: string;
    icon: typeof Megaphone;
    iconTone: string;
    hint?: string;
    details?: DashboardCategory[];
  }>;
  details?: DashboardCategory[];
  capitalGroups?: DashboardSummary["investmentBreakdownForPeriod"];
}) {
  const [expanded, setExpanded] = useState(false);
  const transactionGroups =
    details ?? breakdown?.flatMap((item) => item.details ?? []) ?? [];
  const expandable =
    transactionGroups.length > 0 ||
    Boolean(capitalGroups?.some((group) => group.movements.length));
  return (
    <div className="py-4 first:pt-1 last:pb-1">
      <div className="flex items-center justify-between gap-4">
        {expandable ? (
          <button
            type="button"
            className="flex items-center gap-3 text-sm font-medium text-neutral-200 hover:text-white"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <Icon size={20} className={tone} />
            {label}
            <ChevronDown
              size={16}
              className={`text-neutral-500 transition ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        ) : (
          <div className="flex items-center gap-3 text-sm font-medium text-neutral-200">
            <Icon size={20} className={tone} />
            {label}
          </div>
        )}
        <div className={`tabular-nums text-lg font-semibold ${tone}`}>
          {value}
        </div>
      </div>
      {breakdown ? (
        <dl className="mt-2 grid gap-2 pl-8 sm:grid-cols-2 lg:grid-cols-3">
          {breakdown.map((item) => (
            <div
              key={item.label}
              className="rounded-lg bg-black/20 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-neutral-500">
                  <span
                    data-dashboard-breakdown-icon={item.label}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${item.iconTone}`}
                  >
                    <item.icon size={15} aria-hidden="true" />
                  </span>
                  {item.label}
                </dt>
                <dd className="font-medium tabular-nums text-neutral-300">
                  {item.value}
                </dd>
              </div>
              {item.hint ? (
                <p className="mt-1 pl-9 text-[11px] text-neutral-600">
                  {item.hint}
                </p>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}
      {expanded && transactionGroups.length ? (
        <div className="mt-3 space-y-3 pl-0 sm:pl-8">
          {transactionGroups.map((category) => (
            <DashboardTransactionGroup
              key={`${category.type}:${category.id ?? category.name}`}
              category={category}
              primaryCurrency={currency}
            />
          ))}
        </div>
      ) : null}
      {expanded && capitalGroups?.some((group) => group.movements.length) ? (
        <div className="mt-3 space-y-3 pl-0 sm:pl-8">
          {capitalGroups
            .filter((group) => group.movements.length)
            .map((group) => (
              <section
                key={group.origin}
                className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/60"
              >
                <div className="flex justify-between border-b border-neutral-800 px-3 py-2.5 text-sm">
                  <strong className="text-white">
                    {group.origin === "EXTERNAL"
                      ? "External capital"
                      : group.origin === "SALARY"
                        ? "Salary invested"
                        : "Reinvested profit"}
                  </strong>
                  <span className="tabular-nums text-neutral-200">
                    {formatMoney(group.amount, currency)}
                  </span>
                </div>
                {group.movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between gap-3 border-b border-neutral-800 px-3 py-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">
                        {movement.member.name}
                      </div>
                      <div className="truncate text-xs text-neutral-500">
                        {movement.notes ||
                          (movement.movementType === "WITHDRAWAL"
                            ? "Withdrawal"
                            : "Investment")}{" "}
                        · {formatDate(movement.date)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 tabular-nums ${movement.amountInPrimaryCurrency < 0 ? "text-rose-300" : "text-violet-300"}`}
                    >
                      {formatMoney(movement.amountInPrimaryCurrency, currency)}
                    </span>
                  </div>
                ))}
              </section>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function DashboardTransactionGroup({
  category,
  primaryCurrency,
}: {
  category: DashboardCategory;
  primaryCurrency: string;
}) {
  const transactions = category.transactions ?? [];
  const categoryLabel = `${category.count} ${category.count === 1 ? "transaction" : "transactions"}`;
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/60">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconAvatar
            icon={category.iconPresentation}
            label={category.name}
            size="sm"
          />
          <div className="min-w-0">
            <h4 className="truncate text-sm font-medium text-white">
              {category.name}
            </h4>
            <p className="text-xs text-neutral-500">{categoryLabel}</p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-200">
          {formatMoney(category.amount, primaryCurrency)}
        </span>
      </div>
      <div>
        {transactions.map((transaction) => {
          const channelIcon = transaction.telegramChannel?.photoUrl
            ? {
                type: "image" as const,
                id: transaction.telegramChannel.id,
                url: transaction.telegramChannel.photoUrl,
                name: transaction.telegramChannel.title,
              }
            : null;
          const avatar =
            transaction.iconPresentation ??
            channelIcon ??
            category.iconPresentation ??
            transaction.account?.iconPresentation;
          const signedAmount =
            transaction.type === "expense"
              ? -Math.abs(transaction.amount)
              : transaction.amount;
          return (
            <div
              key={transaction.id}
              data-dashboard-transaction={transaction.id}
              className="grid gap-3 border-b border-neutral-800 px-3 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <IconAvatar
                  icon={avatar}
                  label={transaction.description || category.name}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">
                    {transaction.description || category.name}
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {category.name} · {transaction.account?.name ?? "Account"} ·{" "}
                    {formatDate(transaction.date)}
                  </div>
                </div>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums sm:text-right ${transaction.type === "income" ? "text-emerald-300" : "text-rose-300"}`}
              >
                {formatMoney(signedAmount, transaction.currency)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="mt-6 space-y-6"
      aria-label="Loading dashboard"
      role="status"
    >
      <Card>
        <Skeleton className="mb-4 h-5 w-56" />
        <Skeleton className="h-12 w-64 max-w-full" />
      </Card>
      <Card className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </Card>
      <span className="sr-only">Loading dashboard</span>
    </div>
  );
}
