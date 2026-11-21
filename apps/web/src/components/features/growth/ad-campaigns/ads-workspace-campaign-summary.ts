import { resolveTitleTemplate } from "@telegram-system/shared";
import { type AdCampaign } from "@/lib/api";
import { toAdCampaignInputDate as toInputDate } from "@/components/features/growth/ad-campaigns/ad-campaign-route-state";

export function formatMetric(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}
export function campaignPendingCount(campaign: AdCampaign) {
  const inviteLinkAttributed = (campaign.inviteLinks || []).reduce(
    (sum, link) =>
      sum + Number(link.joinedCount ?? 0) + Number(link.requestedCount ?? 0),
    0,
  );
  const inviteLinkJoined = (campaign.inviteLinks || []).reduce(
    (sum, link) => sum + Number(link.joinedCount ?? 0),
    0,
  );
  const inviteLinkPending = Math.max(
    0,
    inviteLinkAttributed - inviteLinkJoined,
  );
  if (inviteLinkAttributed > 0) return inviteLinkPending;
  const analyticsPending = Number(campaign.analytics?.requestedCount ?? 0);
  if (analyticsPending > 0) return analyticsPending;
  return 0;
}

export function campaignJoinedCount(campaign: AdCampaign) {
  const inviteLinkJoined = (campaign.inviteLinks || []).reduce(
    (sum, link) => sum + Number(link.joinedCount ?? 0),
    0,
  );
  if (inviteLinkJoined > 0) return inviteLinkJoined;
  return Number(campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0);
}

export function campaignAttributedCount(campaign: AdCampaign) {
  const inviteLinkAttributed = (campaign.inviteLinks || []).reduce(
    (sum, link) =>
      sum + Number(link.joinedCount ?? 0) + Number(link.requestedCount ?? 0),
    0,
  );
  if (inviteLinkAttributed > 0) return inviteLinkAttributed;
  const analyticsAttributed = Number(campaign.analytics?.attributedCount ?? 0);
  if (analyticsAttributed > 0) return analyticsAttributed;
  return campaignJoinedCount(campaign) + campaignPendingCount(campaign);
}

export function campaignDateInputValue(campaign: any) {
  return toInputDate(
    campaign?.placementDate || campaign?.startedAt || campaign?.createdAt,
  );
}

export function displayCampaignTitle(campaign: any) {
  const date = toInputDate(
    campaign?.placementDate || campaign?.startedAt || campaign?.createdAt,
  );
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

export function displayCampaignTitleWithDate(campaign: any) {
  const date = campaignDateInputValue(campaign);
  if (String(campaign?.customTitleTemplate || "").trim()) {
    return displayCampaignTitle(campaign);
  }
  return date
    ? `${date} | ${displayCampaignTitle(campaign)}`
    : displayCampaignTitle(campaign);
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
