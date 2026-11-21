import { telegramChannelAccessLabel } from "@/components/features/telegram/telegram/channel-access-badge";
import { type TelegramChannel } from "@/lib/api";

export function formatLocalDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function adjustedPostViews(post: any, ownViewsPerPost: number) {
  return Math.max(
    0,
    toNumber(post.viewsCount) -
      Math.max(0, ownViewsPerPost) -
      toNumber(post.manualOwnViews),
  );
}

export function adjustedPostReactions(post: any, ownReactionsPerPost: number) {
  return Math.max(
    0,
    toNumber(post.reactionsCount) -
      Math.max(0, ownReactionsPerPost) -
      toNumber(post.manualOwnReactions),
  );
}

export const channelMetricTips: Record<string, string> = {
  err: "ERR = Engagement Reach Rate. Formula: average eligible adjusted views / current subscribers * 100. Eligible posts are posts 1-30 days old with views > 0 and not excluded from analytics.",
  reactionRate:
    "Reaction Rate = adjusted reactions / adjusted views * 100. Adjusted reactions subtract channel-wide own reactions per post and manual own reactions on the specific post.",
  cpa: "CPA = Cost Per Acquisition. Formula: total ad spend / joined from invite links.",
  reactions:
    "Adjusted reactions after subtracting channel-wide own reactions per post and manual own reactions on each post. Excludes posts removed from analytics.",
};

export function formatNumber(value: unknown, decimals = 0) {
  return toNumber(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function formatNullableNumber(value: unknown, decimals = 0) {
  if (value == null) return "-";
  return formatNumber(value, decimals);
}

export function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatNumber(value, decimals)}%`;
}

export function hasNumericValue(value: unknown) {
  return value != null && Number.isFinite(Number(value));
}

export function hasPositiveValue(value: unknown) {
  return hasNumericValue(value) && Number(value) > 0;
}

export function hasKpiSettings(channel?: TelegramChannel) {
  return Boolean(
    channel?.targetCpa != null ||
    channel?.acceptableCpa != null ||
    channel?.stopCpa != null,
  );
}

export function channelSubtitle(channel?: TelegramChannel | null) {
  const username = String(channel?.username || "").trim();
  if (username) return username.startsWith("@") ? username : `@${username}`;
  return telegramChannelAccessLabel(channel?.accessMode);
}

export function dataQualityBadgeClass(status?: string | null) {
  if (status === "normal") return "border-emerald-700 text-emerald-200";
  if (status === "borderline") return "border-yellow-700 text-yellow-200";
  if (status === "suspicious") return "border-amber-700 text-amber-200";
  if (status === "anomalous" || status === "invalid")
    return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}
