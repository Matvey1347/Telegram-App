"use client";

import { type ReactNode } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { KpiStatusBadge } from "./campaign-kpi-status-badge";
import { useCampaignText } from "./use-campaign-text";
import {
  MetricPreviewLabel,
  resolveMetricPreviewIcon,
} from "@/lib/metric-preview-icons";
import { formatMoney } from "@/lib/features/finance/money";
import type {
  AdCampaign,
  AdCampaignKpiStatus,
  CurrencySettings,
  TelegramChannel,
} from "@/lib/api";
import {
  formatMetric,
  formatPercent,
  numberOrNull,
  kpiMetricTextClass,
  performanceCardClass,
} from "./campaign-performance-metrics";

function KpiRangeChip({
  tone,
  label,
}: {
  tone: "target" | "ok" | "stop";
  label: string;
}) {
  const className = {
    target: "border-emerald-700 bg-emerald-950/50 text-emerald-200",
    ok: "border-yellow-700 bg-yellow-950/50 text-yellow-200",
    stop: "border-rose-700 bg-rose-950/50 text-rose-200",
  }[tone];
  return (
    <span className={`rounded border px-2 py-1 ${className}`}>{label}</span>
  );
}

export function KpiTooltip({
  channel,
  left,
  top,
}: {
  channel: TelegramChannel;
  left: number;
  top: number;
}) {
  const currency = channel.kpiCurrency || channel.adBaseCurrency || "USD";
  const goodTo = numberOrNull(channel.targetCpa);
  const stopFrom =
    numberOrNull(channel.stopCpaFrom) ?? numberOrNull(channel.stopCpa);
  return (
    <div
      className="fixed z-[80] rounded-lg border border-slate-700 bg-neutral-950 px-3 py-2 shadow-2xl"
      style={{ left, top, width: 430 }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className="text-white">KPI ({currency}):</span>
        <KpiRangeChip
          tone="target"
          label={`target ${goodTo == null ? "-" : `to ${formatMetric(goodTo, 2)} ${currency}`}`}
        />
        <KpiRangeChip
          tone="ok"
          label={`ok ${goodTo != null && stopFrom != null ? `${formatMetric(goodTo, 2)}-${formatMetric(stopFrom, 2)} ${currency}` : "-"}`}
        />
        <KpiRangeChip
          tone="stop"
          label={`stop ${stopFrom == null ? "-" : `from ${formatMetric(stopFrom, 2)} ${currency}`}`}
        />
      </div>
    </div>
  );
}

export function PerformanceCell({
  campaign,
  cost,
  currency,
  primaryCost,
  costPerJoined,
  primaryCostPerJoined,
  joined,
  pending,
  attributed,
  left,
  moneySettings,
  kpiStatus,
  metrics,
  onShowKpiTooltip,
  onHideKpiTooltip,
  onOpenHistory,
  onOpenAdmissionAnalytics,
  onOpenBotRequests,
}: {
  campaign: AdCampaign;
  cost: number;
  currency: string;
  primaryCost: number;
  costPerJoined: number | null;
  primaryCostPerJoined: number | null;
  joined: number;
  pending: number;
  attributed: number;
  left: number;
  moneySettings?: Pick<CurrencySettings, "currencyDisplayMode">;
  kpiStatus: AdCampaignKpiStatus;
  metrics: Array<{ label: string; value: string }>;
  onShowKpiTooltip: (
    channel: TelegramChannel | undefined,
    element: HTMLElement,
  ) => void;
  onHideKpiTooltip: () => void;
  onOpenHistory?: () => void;
  onOpenAdmissionAnalytics?: () => void;
  onOpenBotRequests?: () => void;
}) {
  const kpiTextClass = kpiMetricTextClass(kpiStatus);
  const cardClass = performanceCardClass(kpiStatus);
  const shouldShowKpiTooltip =
    kpiStatus === "good" || kpiStatus === "acceptable" || kpiStatus === "bad";
  const peakJoined = joined + Math.max(0, left);
  const unsubscribedPercent =
    peakJoined > 0 ? (Math.max(0, left) / peakJoined) * 100 : 0;
  const historySummary =
    campaign.inviteLinkHistorySummary ??
    campaign.inviteLinkHistory?.summary ??
    null;
  const historyPeakAttributed = Number(
    historySummary?.peakTotalAttributed ?? 0,
  );
  const historyCurrentAttributed = Number(
    historySummary?.currentTotalAttributed ?? 0,
  );
  const historyCurrentJoined = Number(historySummary?.currentJoinedCount ?? 0);
  const historyDropPercent = Number(historySummary?.drawdownPercent ?? 0);
  const historyDropAbsolute = Number(historySummary?.drawdownFromPeak ?? 0);
  const resolvedPeakAttributed =
    historyPeakAttributed > 0 ? historyPeakAttributed : attributed;
  const resolvedCurrentAttributed =
    historyCurrentAttributed > 0 ? historyCurrentAttributed : attributed;
  const resolvedCurrentJoined =
    historyCurrentJoined > 0 ? historyCurrentJoined : joined;
  const resolvedDropPercent =
    historySummary != null ? historyDropPercent : unsubscribedPercent;
  const resolvedDropAbsolute =
    historySummary != null ? historyDropAbsolute : Math.max(0, left);
  const showTrendDelta = resolvedPeakAttributed > resolvedCurrentAttributed;
  const peakPrimaryCostPerJoined =
    resolvedPeakAttributed > 0 ? primaryCost / resolvedPeakAttributed : null;
  const peakCostPerJoined =
    resolvedPeakAttributed > 0 ? cost / resolvedPeakAttributed : null;
  const showPeakCost =
    showTrendDelta &&
    peakPrimaryCostPerJoined != null &&
    primaryCostPerJoined != null &&
    Math.abs(peakPrimaryCostPerJoined - primaryCostPerJoined) >= 0.005;
  const t = useCampaignText();
  const displayMode = moneySettings?.currencyDisplayMode ?? "code";

  if (campaign.periodCountsUnavailable)
    return (
      <div className="text-sm text-amber-400">
        {t("Joined")}: {campaign.analytics?.joinedCount ?? "—"} ·{" "}
        {t("Requests")}: {campaign.analytics?.requestedCount ?? "—"}
      </div>
    );
  return (
    <div
      data-testid="campaign-performance-card"
      title={
        campaign.inviteLinkWindows?.some(
          (window) =>
            window.lastAttemptStatus === "FAILED" ||
            window.lastAttemptStatus === "PARTIAL",
        )
          ? t("Last confirmed values")
          : undefined
      }
      className={`w-fit max-w-full rounded-lg border p-2.5 ${cardClass}`}
    >
      <div className="inline-grid grid-cols-[minmax(90px,auto)_minmax(92px,auto)_minmax(90px,auto)] gap-x-6">
        <div>
          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            {t("Spend")}
          </p>
          <p className="text-sm font-semibold leading-snug text-white">
            {formatMoney(cost, currency, displayMode)}
          </p>
        </div>
        <div>
          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            {t("Attributed")}
          </p>
          <p className={`text-sm font-semibold leading-snug ${kpiTextClass}`}>
            {formatMetric(attributed)}
          </p>
          <div className="mt-0.5 space-y-0.5 text-[11px] leading-snug text-slate-500">
            <p>
              {t("Joined")} {formatMetric(resolvedCurrentJoined)}
            </p>
            {pending > 0 ? (
              <p>
                {t("Pending")} {formatMetric(pending)}
              </p>
            ) : null}
          </div>
        </div>
        <div>
          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">
            CPA
          </p>
          {costPerJoined != null ? (
            <p className={`text-sm font-semibold leading-snug ${kpiTextClass}`}>
              {formatMoney(costPerJoined, currency, displayMode)}
            </p>
          ) : (
            <p className="text-sm text-slate-500">-</p>
          )}
          {showPeakCost ? (
            <div className="mt-0.5 space-y-0.5 text-[11px] leading-snug text-slate-500">
              <p>
                {t("Peak")}{" "}
                {formatMoney(peakCostPerJoined, currency, displayMode)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {metrics.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {metrics.slice(0, 4).map((metric) => (
            <span
              key={metric.label}
              className="rounded border border-slate-700/80 bg-black/20 px-1.5 py-0.5 text-[11px] text-slate-200"
            >
              {metric.label}: {metric.value}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
        <KpiStatusBadge
          status={kpiStatus}
          onMouseEnter={(event) => {
            if (!shouldShowKpiTooltip) return;
            onShowKpiTooltip(campaign.telegramChannel, event.currentTarget);
          }}
          onMouseLeave={() => {
            if (!shouldShowKpiTooltip) return;
            onHideKpiTooltip();
          }}
        />
        {campaign.inviteLinks?.length ? (
          <>
            {showTrendDelta ? (
              <button
                type="button"
                onClick={onOpenHistory}
                className="rounded border border-slate-700/80 bg-black/20 px-1.5 py-0.5 text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
                title={t("Open campaign trend")}
              >
                {t("Peak")} {formatMetric(resolvedPeakAttributed)}
              </button>
            ) : null}
            {historySummary != null || resolvedDropPercent > 0 ? (
              <button
                type="button"
                onClick={onOpenHistory}
                className="rounded border border-amber-700/80 bg-amber-950/20 px-1.5 py-0.5 text-amber-200 transition-colors hover:border-amber-500 hover:text-amber-100"
                title={t("Open campaign trend")}
              >
                {t("Drop from peak")} {formatMetric(resolvedDropAbsolute)} ·{" "}
                {formatPercent(resolvedDropPercent)}
              </button>
            ) : null}
          </>
        ) : null}
        {campaign.botRequestPerformance ? (
          <button
            type="button"
            onClick={onOpenBotRequests}
            className="rounded border border-cyan-800/80 bg-cyan-950/20 px-1.5 py-0.5 text-cyan-200"
            title={
              campaign.botRequestPerformance.estimated
                ? "При пересечении кампаний заявки распределяются приблизительно по времени снимков."
                : campaign.botRequestPerformance.channels.length
                  ? campaign.botRequestPerformance.channels
                      .map(
                        (channel) =>
                          `${channel.title}: +${formatMetric(channel.requests)}`,
                      )
                      .join("\n")
                  : "No new bot requests in the selected period"
            }
          >
            {t("Bot requests")}{" "}
            {campaign.botRequestPerformance.estimated ? "≈" : "+"}
            {formatMetric(campaign.botRequestPerformance.total)}
          </button>
        ) : null}
      </div>
      <AdmissionViewUpliftBlock
        campaign={campaign}
        onOpenDetails={onOpenAdmissionAnalytics}
      />
    </div>
  );
}

function AdmissionViewUpliftBlock({
  campaign,
  onOpenDetails,
}: {
  campaign: AdCampaign;
  onOpenDetails?: () => void;
}) {
  const analytics = campaign.admissionViewAnalytics;
  const batch = analytics?.latestBatch;
  if (!batch) return null;
  const isBootstrap = batch.detectionMode === "BOOTSTRAPPED_CUMULATIVE";
  const isObserved = batch.baselineMethod === "EARLIEST_OBSERVED";
  const hasBaseline = batch.baselineAvgViews != null;
  const currentAvgViews = batch.currentAvgViews;
  const uplift = batch.cumulativeAvgViewsUplift;
  const incremental = batch.incrementalAvgViewsUplift;
  const qualityWarning = admissionDataQualityMessage(batch.dataQualityReason);
  const sparklinePoints = (analytics?.points || [])
    .map((point, index) => ({
      index,
      value: point.cumulativeAvgViewsUplift ?? 0,
    }))
    .filter((point) => Number.isFinite(point.value));

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <MetricPreviewLabel
            label="View uplift"
            metricKey="views"
            className="text-xs font-semibold text-slate-100"
          />
          <span
            className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-400"
            title={
              isBootstrap
                ? "Reconstructed from the first available invite-link snapshot."
                : "Detected from a positive joined-count delta between two invite-link snapshots."
            }
          >
            {isBootstrap ? "Reconstructed" : "Exact"}
          </span>
        </div>
        {onOpenDetails ? (
          <button
            type="button"
            onClick={onOpenDetails}
            className="text-xs text-slate-300 hover:text-white"
          >
            Details
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5 text-xs text-slate-400">
          <MetricRow
            label={isBootstrap ? "Joined before first tracked sync" : "Joined"}
            metricKey="joined"
          >
            <span className="text-slate-100">
              +{formatMetric(batch.releasedSubscribersCount)}
            </span>
          </MetricRow>
          {hasBaseline && currentAvgViews != null ? (
            <MetricRow
              label={isObserved ? "Observed avg views" : "Avg views"}
              metricKey="views"
            >
              <span className="text-slate-100">
                {formatMetric(batch.baselineAvgViews)} →{" "}
                {formatMetric(currentAvgViews)}
              </span>
            </MetricRow>
          ) : null}
          {uplift != null ? (
            <MetricRow
              label={isObserved ? "Observed view growth" : "View uplift"}
              metricKey="views"
            >
              <span className="text-emerald-200">+{formatMetric(uplift)}</span>
              {incremental != null ? (
                <span className="text-slate-500">
                  {" "}
                  · Last sync +{formatMetric(incremental)}
                </span>
              ) : null}
            </MetricRow>
          ) : (
            <p>View growth: not enough historical post data</p>
          )}
          {batch.estimatedActiveSubscribers != null ? (
            <MetricRow label="Estimated active" metricKey="active">
              <span className="text-slate-100">
                {formatMetric(batch.estimatedActiveSubscribers)} /{" "}
                {formatMetric(batch.releasedSubscribersCount)}
              </span>
              {batch.activationRate != null ? (
                <span className="text-slate-500">
                  {" "}
                  · {isBootstrap ? "Activation estimate" : "Activation"}{" "}
                  {formatPercent(batch.activationRate)}
                </span>
              ) : null}
            </MetricRow>
          ) : null}
          {qualityWarning ? (
            <p className="text-amber-200">{qualityWarning}</p>
          ) : null}
        </div>
        {sparklinePoints.length > 1 ? (
          <div className="h-14 w-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklinePoints}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#34d399"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function admissionDataQualityMessage(reason?: string | null) {
  if (!reason) return null;
  const messages: Record<string, string> = {
    bootstrapped_from_first_snapshot:
      "Result is reconstructed from the first available invite-link measurement.",
    using_earliest_observed_metrics:
      "Uses the earliest available post measurements.",
    missing_pre_admission_post_metrics:
      "Not enough historical post measurements.",
  };
  return (
    reason
      .split("; ")
      .map((item) => messages[item] ?? null)
      .filter(Boolean)
      .join(" ") || null
  );
}

function MetricRow({
  label,
  metricKey,
  children,
}: {
  label: string;
  metricKey: string;
  children: ReactNode;
}) {
  const preview = resolveMetricPreviewIcon({ label, metricKey });
  const Icon = preview?.icon;
  return (
    <div className="grid grid-cols-[18px_minmax(96px,max-content)_minmax(0,1fr)] items-center gap-x-2 text-xs leading-5">
      <span className="flex h-5 w-[18px] items-center justify-center">
        {Icon ? (
          <Icon
            size={14}
            className={preview?.toneClassName ?? "text-slate-400"}
            aria-hidden="true"
          />
        ) : null}
      </span>
      <span className="flex h-5 items-center whitespace-nowrap text-slate-400">
        {label}
      </span>
      <span className="flex min-w-0 items-center text-slate-400">
        {children}
      </span>
    </div>
  );
}
