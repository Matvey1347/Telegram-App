import {
  type AdvertisingChannel,
  type ImportedTelegramSource,
  type TelegramChannel,
} from "@/lib/api";

export function requestErrorMessage(error: unknown, fallback: string) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError?.response?.data?.message || fallback;
}
function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function formatNumber(value: unknown, decimals = 0) {
  return toNumber(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}
export function formatLocalDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isOwnChannel(channel: TelegramChannel) {
  return Array.isArray(channel.adminLinks) && channel.adminLinks.length > 0;
}

export function isPersonSource(
  source: ImportedTelegramSource,
): source is AdvertisingChannel {
  return "kind" in source && source.kind === "person";
}
export function summarizeSync(result: any) {
  const status = result?.status || "success";
  const historical = result?.historical || {};
  const publicInfo = result?.publicInfo || {};
  const posts = result?.postsMetricsSync || {};
  const olderPosts = result?.olderPostsBackfill || {};
  const stats = result?.channelStatsSync || {};
  const importedLinks = toNumber(historical.imported);
  const updatedLinks = toNumber(historical.updated);
  const dailyRows = toNumber(historical.postsUpdated);
  const syncedPosts = toNumber(posts.syncedPosts);
  const olderSyncedPosts = toNumber(olderPosts.syncedPosts);
  const points = toNumber(stats.pointsUpserted);
  const period = formatStatsPeriod(
    stats.snapshot?.normalizedStats?.period,
    stats.snapshot?.normalizedStats?.graphs,
  );
  const publicText = publicInfo.updated
    ? `Channel info: refreshed${publicInfo.subscribersCount != null ? `, ${formatNumber(publicInfo.subscribersCount)} subscribers` : ""}.`
    : publicInfo.reason
      ? `Channel info: not updated (${publicInfo.reason}).`
      : "Channel info: refreshed.";
  const linkText =
    importedLinks || updatedLinks
      ? `Invite links: added ${importedLinks}, updated ${updatedLinks}.`
      : "Invite links: no new or changed links.";
  const inviteGapText =
    historical.inviteLinksScope === "PARTIAL_ADMINS"
      ? `Invite links fetched ${toNumber(historical.inviteLinksFetchedTotal)} of ${toNumber(historical.inviteLinksExpectedTotal)} expected, missing ${toNumber(historical.inviteLinksMissingTotal)}.`
      : null;
  const postText =
    dailyRows || syncedPosts || olderSyncedPosts
      ? `Posts: refreshed ${syncedPosts} post metrics, backfilled ${olderSyncedPosts} older posts, and ${dailyRows} daily rows.`
      : "Posts: no post updates returned.";
  const statsText = stats.success
    ? `Analytics: loaded ${points} chart points${period !== "-" ? ` for ${period}` : ""}.`
    : `Analytics: not updated${stats.snapshot?.normalizedStats?.status ? ` (${stats.snapshot.normalizedStats.status})` : ""}.`;
  return [
    status === "partial" ? "Sync completed partially." : "Sync completed.",
    publicText,
    linkText,
    inviteGapText,
    postText,
    statsText,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatStatsPeriod(period: any, graphs?: Record<string, any>) {
  if (!period) return "-";
  const graphDates = extractGraphDateValues(graphs);
  const minDate = earliestTelegramDateValue([
    period.minDate || period.min_date,
    ...graphDates,
  ]);
  const maxDate = latestTelegramDateValue([
    period.maxDate || period.max_date,
    ...graphDates,
  ]);
  return `${formatTelegramDate(minDate)} - ${formatTelegramDate(maxDate)}`;
}

function formatTelegramDate(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue))
    return formatLocalDate(value as string | Date | null);
  return formatLocalDate(
    new Date(numericValue < 100000000000 ? numericValue * 1000 : numericValue),
  );
}

function latestTelegramDateValue(values: unknown[]) {
  let latest: unknown = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const time = toTelegramDateTime(value);
    if (time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }
  return latest;
}

function earliestTelegramDateValue(values: unknown[]) {
  let earliest: unknown = null;
  let earliestTime = Number.POSITIVE_INFINITY;
  for (const value of values) {
    const time = toTelegramDateTime(value);
    if (time === Number.NEGATIVE_INFINITY) continue;
    if (time < earliestTime) {
      earliest = value;
      earliestTime = time;
    }
  }
  return earliest;
}

function extractGraphDateValues(graphs?: Record<string, any>) {
  const values: unknown[] = [];
  for (const graph of Object.values(graphs || {})) {
    const columns = graph?.data?.columns;
    if (!Array.isArray(columns)) continue;
    const dates = columns.find(
      (column: unknown) => Array.isArray(column) && column[0] === "x",
    );
    if (!Array.isArray(dates)) continue;
    values.push(...dates.slice(1));
  }
  return values;
}

function toTelegramDateTime(value: unknown) {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue < 100000000000 ? numericValue * 1000 : numericValue;
  }
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime())
    ? Number.NEGATIVE_INFINITY
    : date.getTime();
}
