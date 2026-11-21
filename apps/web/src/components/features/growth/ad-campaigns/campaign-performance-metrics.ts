import { convertMoney } from "@/lib/features/finance/money";
import type { AdCampaign, AdCampaignKpiStatus } from "@/lib/api";

export function formatMetric(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatMetric(value, decimals)}%`;
}

export function numberOrNull(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isInRange(value: number, from: number | null, to: number | null) {
  if (from == null && to == null) return false;
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

function calculatedKpiStatus(
  value: number | null,
  channel?: AdCampaign["telegramChannel"],
): AdCampaignKpiStatus {
  if (value == null || !channel) return "unknown";
  const targetFrom = numberOrNull(channel.targetCpaFrom);
  const target = numberOrNull(channel.targetCpa);
  const acceptableFrom = numberOrNull(channel.acceptableCpaFrom);
  const acceptable = numberOrNull(channel.acceptableCpa);
  const stopFrom =
    numberOrNull(channel.stopCpaFrom) ?? numberOrNull(channel.stopCpa);
  if (
    targetFrom == null &&
    target == null &&
    acceptableFrom == null &&
    acceptable == null &&
    stopFrom == null
  ) {
    return "unknown";
  }
  if (target != null || stopFrom != null) {
    if (target != null && value <= target) return "good";
    if (stopFrom != null && value >= stopFrom) return "bad";
    if (target != null && stopFrom != null) return "acceptable";
  }
  if (isInRange(value, targetFrom, target)) return "good";
  if (isInRange(value, acceptableFrom, acceptable)) return "acceptable";
  if (isInRange(value, stopFrom, null)) return "bad";
  return "unknown";
}

export function effectiveCampaignKpiStatus(
  campaign: AdCampaign,
  costPerJoined: number | null,
  rates: any[] | undefined,
): AdCampaignKpiStatus {
  const kpiCurrency = campaign.telegramChannel?.kpiCurrency;
  const cpaInKpiCurrency = kpiCurrency
    ? convertMoney(costPerJoined, campaign.currency, kpiCurrency, rates)
    : costPerJoined;
  return calculatedKpiStatus(cpaInKpiCurrency, campaign.telegramChannel);
}

function hasValue(value: unknown) {
  return value != null && Number.isFinite(Number(value));
}

export function campaignMetrics(campaign: AdCampaign) {
  const metrics = [
    {
      label: "New subs",
      value: (campaign as any)?.newSubscribers,
      format: (value: unknown) => formatMetric(value),
    },
    {
      label: "Raw uplift",
      value: (campaign as any)?.rawActiveSubscribersFromAd,
      format: (value: unknown) => formatMetric(value),
    },
    {
      label: "Active CPA",
      value: (campaign as any)?.cappedActiveCpa ?? (campaign as any)?.activeCpa,
      format: (value: unknown) => formatMetric(value, 2),
    },
    {
      label: "Retention 7d",
      value: (campaign as any)?.retention7d,
      format: (value: unknown) => formatPercent(value),
    },
  ];

  return metrics
    .filter((metric) => hasValue(metric.value))
    .map((metric) => ({
      label: metric.label,
      value: metric.format(metric.value),
    }));
}

export function kpiMetricTextClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "text-emerald-300";
  if (status === "acceptable") return "text-yellow-200";
  if (status === "bad") return "text-rose-200";
  return "text-white";
}

export function performanceCardClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "border-emerald-700/70 bg-emerald-950/20";
  if (status === "acceptable") return "border-yellow-700/70 bg-yellow-950/20";
  if (status === "bad") return "border-rose-700/70 bg-rose-950/20";
  return "border-slate-800 bg-slate-950/40";
}
