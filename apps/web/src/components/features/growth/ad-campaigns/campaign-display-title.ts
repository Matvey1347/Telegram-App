import { resolveTitleTemplate } from "@telegram-system/shared";
import type { AdCampaign } from "@/lib/api";

function displayCampaignTitle(campaign: AdCampaign) {
  const date = toInputDate(
    campaign?.placementDate ||
      campaign?.startedAt ||
      (campaign as AdCampaign & { createdAt?: string })?.createdAt,
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

export function displayCampaignTitleWithDate(campaign: AdCampaign) {
  if (String(campaign?.customTitleTemplate || "").trim()) {
    return displayCampaignTitle(campaign);
  }
  const date = toInputDate(
    campaign?.placementDate ||
      campaign?.startedAt ||
      (campaign as AdCampaign & { createdAt?: string })?.createdAt,
  );
  return date
    ? `${date} | ${displayCampaignTitle(campaign)}`
    : displayCampaignTitle(campaign);
}

function generatedCampaignDisplayTitle(campaign: AdCampaign) {
  const sources = (campaign?.advertisingChannels || [])
    .map((source) => source.title || ("name" in source ? String(source.name) : ""))
    .filter(Boolean);
  const promo = campaign?.promo?.title;
  const parts = [...sources.slice(0, 2), promo].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(" | ");
  return campaign?.telegramChannel?.title || "Campaign";
}

function toInputDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
