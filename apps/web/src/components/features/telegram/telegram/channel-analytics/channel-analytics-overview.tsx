"use client";

import { Fragment, type ReactNode } from "react";
import { NativeMoney } from "@/components/ui/native-money";
import { Skeleton } from "@/components/ui/primitives";
import {
  toNumber,
  formatNumber,
  formatNullableNumber,
  formatPercent,
  hasNumericValue,
  hasPositiveValue,
  dataQualityBadgeClass,
} from "./channel-analytics-format";
import { SimplePanel, SnapshotItem } from "./channel-analytics-primitives";
import type { SettingsState } from "./use-channel-analytics-queries";

export function OverviewPanelSkeleton({ title }: { title: string }) {
  return (
    <SimplePanel title={title}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(136px,100%),1fr))] gap-2">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="min-h-[58px] rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-2"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-6 w-20" />
          </div>
        ))}
      </div>
    </SimplePanel>
  );
}

function OverviewGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(136px,100%),1fr))] gap-2">
      {children}
    </div>
  );
}

export function AudienceOverview({ audience }: { audience: any }) {
  return (
    <SimplePanel title="Audience overview">
      {audience?.dataQualityWarning ? (
        <div className="mb-2 rounded-lg border border-amber-700/70 bg-amber-950/30 px-3 py-2 text-xs font-medium text-amber-100">
          {audience.dataQualityWarning}
        </div>
      ) : null}
      <OverviewGrid>
        <SnapshotItem
          label="Subscribers"
          value={formatNullableNumber(audience?.subscribersCount)}
        />
        <SnapshotItem
          label="Known fake subscribers"
          value={formatNumber(audience?.knownFakeSubscribersCount)}
        />
        <SnapshotItem
          label="Effective subscribers"
          value={formatNullableNumber(audience?.effectiveSubscribersCount)}
        />
        <SnapshotItem
          label="Own / seed subscribers"
          value={formatNumber(audience?.seedSubscribersCount)}
        />
        <SnapshotItem
          label="Own views per post"
          value={formatNumber(audience?.ownViewsPerPost)}
        />
        <SnapshotItem
          label="Own reactions per post"
          value={formatNumber(audience?.ownReactionsPerPost)}
        />
        <SnapshotItem
          label="Active subscribers"
          value={formatNullableNumber(audience?.activeSubscribersEstimate)}
        />
        <SnapshotItem
          label="Raw active estimate"
          value={formatNullableNumber(audience?.rawActiveSubscribersEstimate)}
        />
        <SnapshotItem
          label="Capped active estimate"
          value={formatNullableNumber(
            audience?.cappedActiveSubscribersEstimate,
          )}
        />
        <SnapshotItem
          label="Paid active estimate"
          value={formatNullableNumber(audience?.paidActiveSubscribersEstimate)}
        />
        <SnapshotItem
          label="View rate"
          value={formatPercent(audience?.viewRate)}
        />
        <SnapshotItem
          label="Raw view rate"
          value={formatPercent(audience?.rawViewRate)}
        />
        <SnapshotItem
          label="Capped view rate"
          value={formatPercent(audience?.cappedViewRate)}
        />
        <SnapshotItem
          label="Avg adjusted views"
          value={formatNullableNumber(audience?.avgViewsAdjusted, 1)}
        />
        <SnapshotItem
          label="Avg adjusted reactions"
          value={formatNullableNumber(audience?.avgReactionsAdjusted, 1)}
        />
        <div className="min-h-[58px] rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-2">
          <p className="text-xs text-slate-400">Data quality</p>
          <span
            className={`mt-1 inline-flex rounded border px-2 py-0.5 text-xs ${dataQualityBadgeClass(audience?.dataQuality)}`}
          >
            {audience?.dataQuality || "-"}
          </span>
          {audience?.subscriberBaseQuality ? (
            <p className="mt-1 truncate text-xs text-slate-400">
              Subscriber base: {audience.subscriberBaseQuality}
            </p>
          ) : null}
        </div>
        <SnapshotItem
          label="Posts window"
          value={`${formatNumber(audience?.postsUsed)} / ${formatNumber(audience?.postsWindow)}`}
        />
      </OverviewGrid>
    </SimplePanel>
  );
}

export function FinancialOverview({
  summary,
  channel,
  hasKpi,
  settings,
}: {
  summary: any;
  channel: any;
  hasKpi: boolean;
  settings: SettingsState;
}) {
  const currency = summary?.currency || settings.kpiCurrency || "USD";
  const purchaseAmount = toNumber(
    summary?.acquisitionCost ??
      channel?.purchaseTransaction?.amountInPrimaryCurrency,
  );
  const adSpend = toNumber(summary?.totalAdSpend);
  const totalSpend = toNumber(summary?.totalSpend ?? adSpend + purchaseAmount);
  const hasPaidLaunches = toNumber(summary?.campaignsCount) > 0 || adSpend > 0;
  const hasPurchaseExpense = purchaseAmount > 0;
  if (!hasKpi && !hasPaidLaunches && !hasPurchaseExpense) return null;
  const moneyValue = (value: unknown) => (
    <NativeMoney amount={value as number | null} currency={currency} />
  );
  const metrics = [
    {
      key: "totalSpend",
      show: totalSpend > 0,
      node: <SnapshotItem label="Total spend" value={moneyValue(totalSpend)} />,
    },
    {
      key: "purchase",
      show: hasPurchaseExpense,
      node: (
        <SnapshotItem
          label="Channel purchase"
          value={moneyValue(purchaseAmount)}
        />
      ),
    },
    {
      key: "spend",
      show: adSpend > 0,
      node: <SnapshotItem label="Ad spend" value={moneyValue(adSpend)} />,
    },
    {
      key: "campaigns",
      show: hasPositiveValue(summary?.campaignsCount),
      node: (
        <SnapshotItem
          label="Campaigns count"
          value={formatNumber(summary?.campaignsCount)}
        />
      ),
    },
    {
      key: "joined",
      show: hasPositiveValue(summary?.totalJoinedSubscribers),
      node: (
        <SnapshotItem
          label="Total joined subscribers"
          value={formatNumber(summary?.totalJoinedSubscribers)}
        />
      ),
    },
    {
      key: "pending",
      show: hasPositiveValue(summary?.totalPendingSubscribers),
      node: (
        <SnapshotItem
          label="Total pending requests"
          value={formatNumber(summary?.totalPendingSubscribers)}
        />
      ),
    },
    {
      key: "attributed",
      show:
        hasPositiveValue(summary?.totalAttributedSubscribers) &&
        toNumber(summary?.totalAttributedSubscribers) !==
          toNumber(summary?.totalJoinedSubscribers),
      node: (
        <SnapshotItem
          label="Total attributed subscribers"
          value={formatNumber(summary?.totalAttributedSubscribers)}
        />
      ),
    },
    {
      key: "active",
      show: hasPositiveValue(summary?.paidActiveSubscribersEstimate),
      node: (
        <SnapshotItem
          label="Active subscribers from ads"
          value={formatNullableNumber(summary?.paidActiveSubscribersEstimate)}
        />
      ),
    },
    {
      key: "avgCpa",
      show: hasNumericValue(summary?.avgCpa),
      node: (
        <SnapshotItem label="Avg CPA" value={moneyValue(summary?.avgCpa)} />
      ),
    },
    {
      key: "activeCpa",
      show: hasNumericValue(summary?.activeCpa),
      node: (
        <SnapshotItem
          label="Active CPA"
          value={moneyValue(summary?.activeCpa)}
        />
      ),
    },
    {
      key: "activeRate",
      show: hasNumericValue(summary?.avgActiveRate),
      node: (
        <SnapshotItem
          label="Avg active rate"
          value={formatPercent(summary?.avgActiveRate)}
        />
      ),
    },
    {
      key: "retention",
      show: hasNumericValue(summary?.avgRetention7d),
      node: (
        <SnapshotItem
          label="Avg retention 7d"
          value={formatPercent(summary?.avgRetention7d)}
        />
      ),
    },
  ].filter((metric) => metric.show);
  const showKpiStatus =
    hasKpi && summary?.kpiStatus && summary.kpiStatus !== "unknown";
  return (
    <SimplePanel title="KPI / Financial overview">
      {hasKpi && !hasPaidLaunches && !hasPurchaseExpense ? (
        <div className="mb-2 rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-xs text-slate-300">
          No paid launches yet.
        </div>
      ) : null}
      {metrics.length || showKpiStatus ? (
        <div className="space-y-2">
          <OverviewGrid>
            {metrics.map((metric) => (
              <Fragment key={metric.key}>{metric.node}</Fragment>
            ))}
            {showKpiStatus ? (
              <div className="min-h-[58px] rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-2">
                <p className="text-xs text-slate-400">KPI status</p>
                <span
                  className={`mt-1 inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(summary?.kpiStatus)}`}
                >
                  {summary?.kpiLabel || "-"}
                </span>
              </div>
            ) : null}
          </OverviewGrid>
          {hasKpi ? <KpiTargetsInline settings={settings} /> : null}
        </div>
      ) : null}
    </SimplePanel>
  );
}

function KpiTargetsInline({ settings }: { settings: SettingsState }) {
  const goodTo = settings.targetCpa;
  const stopFrom = settings.stopCpaFrom;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2">
      <KpiTarget
        tone="good"
        label="Target CPA"
        display={
          goodTo ? `to ${formatNumber(goodTo, 2)} ${settings.kpiCurrency}` : "-"
        }
        compact
      />
      <KpiTarget
        tone="warn"
        label="Acceptable CPA"
        display={
          goodTo && stopFrom
            ? `${formatNumber(goodTo, 2)}–${formatNumber(stopFrom, 2)} ${settings.kpiCurrency}`
            : "-"
        }
        compact
      />
      <KpiTarget
        tone="bad"
        label="Stop CPA"
        display={
          stopFrom
            ? `from ${formatNumber(stopFrom, 2)} ${settings.kpiCurrency}`
            : "-"
        }
        compact
      />
    </div>
  );
}

function KpiTarget({
  tone,
  label,
  display,
  compact = false,
}: {
  tone: "good" | "warn" | "bad";
  label: string;
  display: string;
  compact?: boolean;
}) {
  const toneClass = {
    good: "border-emerald-800/80 bg-emerald-950/30 text-emerald-200",
    warn: "border-yellow-800/80 bg-yellow-950/30 text-yellow-200",
    bad: "border-rose-800/80 bg-rose-950/30 text-rose-200",
  }[tone];
  return (
    <div
      className={`rounded-lg border ${compact ? "px-2.5 py-2" : "p-3"} ${toneClass}`}
    >
      <p className="text-xs opacity-80">{label}</p>
      <p
        className={
          compact ? "mt-1 text-sm font-semibold" : "mt-1 text-lg font-semibold"
        }
      >
        {display}
      </p>
    </div>
  );
}

function kpiBadgeClass(status?: string) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}
