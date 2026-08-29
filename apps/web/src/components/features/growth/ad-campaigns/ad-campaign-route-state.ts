export type AdCampaignsViewMode = "campaigns" | "promos" | "hypotheses";

export function isAdCampaignsViewMode(
  value: string | null,
): value is AdCampaignsViewMode {
  return value === "campaigns" || value === "promos" || value === "hypotheses";
}

export function resolveInitialAdCampaignsView(
  requested: string | null,
  stored: string | null,
): AdCampaignsViewMode {
  if (isAdCampaignsViewMode(requested)) return requested;
  return isAdCampaignsViewMode(stored) ? stored : "campaigns";
}

export function formatAdCampaignLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toAdCampaignInputDate(value?: string | Date | null) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : formatAdCampaignLocalDate(date);
}
