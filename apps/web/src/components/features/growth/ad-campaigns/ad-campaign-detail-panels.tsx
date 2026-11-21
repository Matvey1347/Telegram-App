import type { ReactNode } from "react";
import { Card } from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { resolveTitleTemplate } from "@telegram-system/shared";
import type { AdCampaign } from "@/lib/api";
import { formatDateTime as formatDisplayDateTime } from "@/lib/date-format";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumber(value: unknown, decimals = 0) {
  const parsed = toNumber(value);
  if (parsed == null) return "-";
  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatPercent(value: unknown) {
  const parsed = toNumber(value);
  if (parsed == null) return "-";
  return `${formatNumber(parsed, 1)}%`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return formatDisplayDateTime(value);
}

export function statusClass(status?: string | null) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

export function dataQualityClass(status?: string | null) {
  if (status === "normal") return "border-emerald-700 text-emerald-200";
  if (status === "borderline") return "border-yellow-700 text-yellow-200";
  if (status === "suspicious") return "border-amber-700 text-amber-200";
  if (status === "anomalous" || status === "invalid")
    return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

export function formatMoneyValue(value: unknown, currency: string) {
  const parsed = toNumber(value);
  if (parsed == null) return "-";
  return `${formatNumber(parsed, 2)} ${currency}`;
}

export function displayCampaignTitle(campaign: any) {
  const date =
    campaign?.placementDate || campaign?.startedAt || campaign?.createdAt
      ? new Date(
          campaign.placementDate || campaign.startedAt || campaign.createdAt,
        )
          .toISOString()
          .slice(0, 10)
      : "";
  const customTitle = resolveTitleTemplate(campaign?.customTitleTemplate, {
    date,
  });
  if (customTitle) return customTitle;
  let title = String(campaign?.title || "").trim();
  title = title.replace(/^Telegram ad campaign:\s*/i, "").trim();
  if (date) {
    title = title
      .replace(new RegExp(`^${date}\\s*\\|\\s*`), "")
      .replace(new RegExp(`^${date}\\b\\s*[-|:]?\\s*`), "")
      .trim();
  }
  if (!title || /^Campaign\s+\d{4}-\d{2}-\d{2}$/i.test(title)) {
    return generatedCampaignDisplayTitle(campaign);
  }
  return title;
}

function generatedCampaignDisplayTitle(campaign: any) {
  const sources = (campaign?.advertisingChannels || [])
    .map((source: any) => source.title || source.name)
    .filter(Boolean);
  const promo = campaign?.promo?.title;
  const parts = [...sources.slice(0, 2), promo].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(" | ");
  return campaign?.telegramChannel?.title || "Campaign";
}

function hasMetricValue(value: unknown) {
  const parsed = toNumber(value);
  return parsed != null && parsed !== 0;
}

function analyticsMetrics(campaign: any, currency: string) {
  const rows = [
    {
      label: "New subscribers",
      value: campaign.newSubscribers,
      display: formatNumber(campaign.newSubscribers),
    },
    {
      label: "Active subscribers from ad",
      value:
        campaign.activeSubscribersFromAd ??
        campaign.cappedActiveSubscribersFromAd,
      display: formatNumber(
        campaign.activeSubscribersFromAd ??
          campaign.cappedActiveSubscribersFromAd,
      ),
    },
    {
      label: "Raw active uplift",
      value: campaign.rawActiveSubscribersFromAd,
      display: formatNumber(campaign.rawActiveSubscribersFromAd),
    },
    {
      label: "CPA",
      value:
        (campaign as any).cpa ?? campaign.analytics?.costPerJoinedSubscriber,
      display: formatMoneyValue(
        (campaign as any).cpa ?? campaign.analytics?.costPerJoinedSubscriber,
        currency,
      ),
    },
    {
      label: "Active CPA",
      value: campaign.cappedActiveCpa ?? campaign.activeCpa,
      display: formatMoneyValue(
        campaign.cappedActiveCpa ?? campaign.activeCpa,
        currency,
      ),
    },
    {
      label: "Active rate",
      value: campaign.cappedActiveRate ?? campaign.activeRate,
      display: formatPercent(campaign.cappedActiveRate ?? campaign.activeRate),
    },
    {
      label: "Retention 7d",
      value: campaign.retention7d,
      display: formatPercent(campaign.retention7d),
    },
    {
      label: "View rate after",
      value: campaign.cappedViewRateAfter ?? campaign.rawViewRateAfter,
      display: formatPercent(
        campaign.cappedViewRateAfter ?? campaign.rawViewRateAfter,
      ),
    },
  ];
  return rows.filter((row) => hasMetricValue(row.value));
}

export function AnalyticsPanel({
  campaign,
  currency,
}: {
  campaign: any;
  currency: string;
}) {
  const metrics = analyticsMetrics(campaign, currency);
  if (!metrics.length) {
    return (
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Analytics</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Analytics is collected automatically from Telegram snapshots and
              invite-link data. No manual input is required here.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-amber-200">
              There is not enough captured data for this campaign yet. If the
              placement is old and snapshots were not captured at the time,
              early-window metrics cannot be reconstructed retroactively.
            </p>
          </div>
          <span
            className={`inline-flex rounded border px-2 py-0.5 text-xs ${dataQualityClass(campaign.adDataQuality)}`}
          >
            {campaign.adDataQuality || "no data"}
          </span>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <h3 className="mb-3 text-lg font-semibold">Analytics</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            title={metric.label}
            value={metric.display}
          />
        ))}
      </div>
    </Card>
  );
}

export function AdmissionViewAnalyticsPanel({
  campaign,
}: {
  campaign: AdCampaign;
}) {
  const batch = campaign.admissionViewAnalytics?.latestBatch;
  if (!batch) return null;
  const observed = batch.baselineMethod === "EARLIEST_OBSERVED";
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">View uplift</h3>
          <p className="text-sm text-slate-400">
            {batch.detectionMode === "BOOTSTRAPPED_CUMULATIVE"
              ? "Reconstructed from existing invite-link snapshots"
              : "Detected from invite-link joined-count deltas"}
          </p>
        </div>
        <span
          className={`rounded border px-2 py-0.5 text-xs ${batch.dataQuality === "GOOD" ? "border-emerald-700 text-emerald-200" : "border-amber-700 text-amber-200"}`}
        >
          {batch.dataQuality}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <MetricCard
          title="Released"
          value={`+${formatNumber(batch.releasedSubscribersCount)}`}
        />
        <MetricCard
          title={observed ? "Observed avg views" : "Avg views"}
          value={
            batch.baselineAvgViews == null || batch.currentAvgViews == null
              ? "-"
              : `${formatNumber(batch.baselineAvgViews)} → ${formatNumber(batch.currentAvgViews)}`
          }
        />
        <MetricCard
          title={observed ? "Observed view growth" : "View uplift"}
          value={
            batch.cumulativeAvgViewsUplift == null
              ? "Not enough historical post data"
              : `+${formatNumber(batch.cumulativeAvgViewsUplift)}`
          }
        />
        <MetricCard
          title="Estimated active"
          value={
            batch.estimatedActiveSubscribers == null
              ? "-"
              : `${formatNumber(batch.estimatedActiveSubscribers)} / ${formatNumber(batch.releasedSubscribersCount)}`
          }
        />
        <MetricCard
          title={
            batch.detectionMode === "BOOTSTRAPPED_CUMULATIVE"
              ? "Activation estimate"
              : "Activation"
          }
          value={
            batch.activationRate == null
              ? "-"
              : formatPercent(batch.activationRate)
          }
        />
        <MetricCard
          title="Last sync uplift"
          value={
            batch.incrementalAvgViewsUplift == null
              ? "-"
              : `+${formatNumber(batch.incrementalAvgViewsUplift)}`
          }
        />
      </div>
      {batch.baselineMethod === "EARLIEST_OBSERVED" ? (
        <p className="mt-3 rounded border border-amber-800 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
          Observed growth from the earliest available post snapshot
        </p>
      ) : null}
      {admissionDataQualityMessage(batch.dataQualityReason) ? (
        <p className="mt-3 text-sm text-slate-400">
          {admissionDataQualityMessage(batch.dataQualityReason)}
        </p>
      ) : null}
    </Card>
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

export function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-xs text-slate-400">{title}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

export function InfoPill({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-0.5 font-semibold text-slate-100">{value}</div>
    </div>
  );
}

export function AttributionPreview({
  item,
  kind,
  fallback,
}: {
  item: any;
  kind: "channel" | "person";
  fallback: string;
}) {
  const title = item?.title || item?.name || fallback;
  const subtitle = attributionSubtitle(item, kind);
  const imageUrl = item?.photoUrl || item?.imageUrl;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <TelegramEntityAvatar
        imageUrl={imageUrl}
        kind={kind}
        alt={title}
        size="lg"
      />
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{title}</p>
        {subtitle ? (
          <p className="mt-1 truncate text-sm text-slate-400">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

function attributionSubtitle(item: any, kind: "channel" | "person") {
  if (!item) return "";
  const username = item.username || item.telegramUsername;
  if (username) return `@${String(username).replace(/^@/, "")}`;
  const subscribers = item.currentSubscribersCount ?? item.subscribersCount;
  if (subscribers != null && Number.isFinite(Number(subscribers))) {
    return `${Number(subscribers).toLocaleString()} subscribers`;
  }
  if (item.telegramChatId) return `ID ${item.telegramChatId}`;
  if (item.label) return item.label;
  return kind === "person"
    ? "Person"
    : item.sourceKind === "own_channel"
      ? "Own channel"
      : "Telegram channel";
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-1.5">
      <span className="w-32 shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-200">{value}</span>
    </div>
  );
}
