import {
  median,
  selectExpectedViewsAtWindow,
  type ExpectedViewsWindowPost,
} from '../../../common/analytics/telegram-post-expected-views';
import { parseTelegramHtml } from '../../../telegram/shared/markup/telegram-html-parser';
import { telegramMarkupToHtml } from '../../../telegram/shared/markup/telegram-markup';
import {
  classifyPostOrigin,
  type TelegramPostOrigin,
} from './telegram-post-origin';

export const TELEGRAM_POST_PERFORMANCE_METHOD_VERSION = '3';
export const TELEGRAM_POST_PERFORMANCE_TARGETS = [
  { hours: 24, toleranceHours: 2 },
  { hours: 72, toleranceHours: 6 },
  { hours: 168, toleranceHours: 12 },
] as const;
export const TELEGRAM_POST_PERFORMANCE_MIN_SAMPLE = 8;
export const TELEGRAM_POST_PERFORMANCE_LOOKBACK_DAYS = 28;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type PerformanceSnapshot = {
  collectedAt: Date;
  viewsCount: number | null;
  reactionsCount: number | null;
  forwardsCount: number | null;
  commentsCount: number | null;
};

export type PerformancePostInput = Omit<
  ExpectedViewsWindowPost,
  'metricSnapshots'
> & {
  id: string;
  metricSnapshots: PerformanceSnapshot[];
  telegramChannelId: string;
  telegramMessageId: string;
  text: string | null;
  formattedText: string | null;
  postDate: Date;
  viewsCount: number | null;
  reactionsCount: number | null;
  forwardsCount: number | null;
  commentsCount: number | null;
  hasMedia: boolean;
  mediaKind: string | null;
  imageUrls: string[];
  excludeFromAnalytics: boolean;
  adSalePlacements: unknown[];
  managedPosts: Array<{
    id: string;
    aiPostingGeneration?: unknown;
    adSalePlacements?: unknown[];
    mutualPromotionDelivery?: unknown;
  }>;
  crossPromotion?: boolean;
  manualClassification?: string | null;
  performance?: { manualClassification: string | null } | null;
};

export function selectMetricSnapshotAtWindow(
  postDate: Date,
  snapshots: PerformanceSnapshot[],
  targetHours: number,
  toleranceHours: number,
  now: Date,
) {
  const targetAt = postDate.getTime() + targetHours * HOUR_MS;
  if (targetAt > now.getTime()) return null;
  const candidate = snapshots
    .filter(
      (snapshot) =>
        snapshot.collectedAt >= postDate && snapshot.collectedAt <= now,
    )
    .map((snapshot) => ({
      snapshot,
      difference: Math.abs(snapshot.collectedAt.getTime() - targetAt),
    }))
    .sort((left, right) => left.difference - right.difference)[0];
  return candidate && candidate.difference <= toleranceHours * HOUR_MS
    ? candidate.snapshot
    : null;
}

export function dueAgeTargetsInPreviousHour(postDate: Date, now: Date) {
  const hourAgo = now.getTime() - HOUR_MS;
  return TELEGRAM_POST_PERFORMANCE_TARGETS.filter(({ hours }) => {
    const targetAt = postDate.getTime() + hours * HOUR_MS;
    return targetAt >= hourAgo && targetAt <= now.getTime();
  });
}

export function isSnapshotAtPerformanceAgePoint(
  postDate: Date,
  collectedAt: Date,
) {
  return TELEGRAM_POST_PERFORMANCE_TARGETS.some(
    ({ hours, toleranceHours }) =>
      Math.abs(collectedAt.getTime() - postDate.getTime() - hours * HOUR_MS) <=
      toleranceHours * HOUR_MS,
  );
}

export function visibleTelegramText(markup: string | null | undefined) {
  if (!markup) return '';
  const parsedHtml = parseTelegramHtml(markup)[0];
  if (parsedHtml !== markup) return parsedHtml;
  return parseTelegramHtml(telegramMarkupToHtml(markup))[0];
}

export function telegramPostLengthBand(lengthChars: number) {
  if (lengthChars < 400) return 'short';
  if (lengthChars <= 1000) return 'medium';
  return 'long';
}

export function telegramLocalPublicationParts(
  publishedAt: Date,
  timezone: string,
) {
  const hourParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(publishedAt);
  const hour = Number(hourParts.find((part) => part.type === 'hour')?.value);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(publishedAt);
  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    hour: Number.isInteger(hour) ? hour : 0,
    weekday: weekdayIndex[weekday] ?? 0,
  };
}

export function isTelegramPostExcludedFromNorm(post: PerformancePostInput) {
  if (
    post.manualClassification === 'AD' ||
    post.manualClassification === 'MUTUAL_PROMO' ||
    post.manualClassification === 'EXCLUDED'
  )
    return `MANUAL_${post.manualClassification}`;
  if (post.excludeFromAnalytics) return 'EXCLUDED_FROM_ANALYTICS';
  if (
    post.adSalePlacements.length ||
    post.managedPosts.some(
      (managedPost) => managedPost.adSalePlacements?.length,
    )
  )
    return 'AD';
  if (
    post.crossPromotion ||
    post.managedPosts.some((managedPost) => managedPost.mutualPromotionDelivery)
  )
    return 'MUTUAL_PROMO';
  return null;
}

function viewAtWindow(
  post: PerformancePostInput,
  targetHours: number,
  now: Date,
) {
  const target = TELEGRAM_POST_PERFORMANCE_TARGETS.find(
    (item) => item.hours === targetHours,
  );
  return selectExpectedViewsAtWindow(post, targetHours, now, {
    toleranceHours: target?.toleranceHours,
  });
}

function finalViews(post: PerformancePostInput, now: Date) {
  const finalAt = post.postDate.getTime() + 168 * HOUR_MS;
  if (now.getTime() < finalAt) return null;
  const latest = [...post.metricSnapshots]
    .filter(
      (snapshot) =>
        snapshot.collectedAt.getTime() >= finalAt &&
        snapshot.collectedAt <= now,
    )
    .sort(
      (left, right) => right.collectedAt.getTime() - left.collectedAt.getTime(),
    )[0];
  return latest?.viewsCount ?? post.viewsCount;
}

function targetMetrics(
  post: PerformancePostInput,
  targetHours: number,
  now: Date,
) {
  const definition = TELEGRAM_POST_PERFORMANCE_TARGETS.find(
    (target) => target.hours === targetHours,
  );
  const snapshot = selectMetricSnapshotAtWindow(
    post.postDate,
    post.metricSnapshots,
    targetHours,
    definition?.toleranceHours ?? 0,
    now,
  );
  return {
    views: viewAtWindow(post, targetHours, now),
    reactions: snapshot?.reactionsCount ?? null,
    forwards: snapshot?.forwardsCount ?? null,
    comments: snapshot?.commentsCount ?? null,
  };
}

function eligibleComparable(post: PerformancePostInput) {
  return !isTelegramPostExcludedFromNorm(post);
}

export function computeTelegramPostPerformance(
  post: PerformancePostInput,
  comparablePosts: PerformancePostInput[],
  timezone: string,
  now: Date,
) {
  const origin: TelegramPostOrigin = post.manualClassification === 'AD'
    ? 'AD'
    : post.manualClassification === 'MUTUAL_PROMO'
      ? 'MUTUAL_PROMO'
      : classifyPostOrigin({
    managedPost: post.managedPosts[0] ?? null,
    adSalePlacement: post.adSalePlacements.length > 0,
    mutualPromotionDelivery: post.managedPosts.some(
      (managedPost) => managedPost.mutualPromotionDelivery,
    ),
    crossPromotion: post.crossPromotion,
      });
  const excludedReason = isTelegramPostExcludedFromNorm(post);
  const body = visibleTelegramText(post.text ?? post.formattedText);
  const lengthChars = [...body].length;
  const publishedAt = post.postDate;
  const publish = telegramLocalPublicationParts(publishedAt, timezone);
  const current24 = targetMetrics(post, 24, now);
  const current72 = targetMetrics(post, 72, now);
  const current168 = targetMetrics(post, 168, now);
  const matured = now.getTime() - post.postDate.getTime() >= 168 * HOUR_MS;
  const viewsFinal = finalViews(post, now);
  const comparable = comparablePosts.filter(
    (candidate) =>
      candidate.postDate < post.postDate &&
      candidate.postDate.getTime() >= publishedAt.getTime() - 28 * DAY_MS &&
      eligibleComparable(candidate),
  );
  const views24Samples = comparable
    .map((candidate) => viewAtWindow(candidate, 24, now))
    .filter(
      (views): views is number => views != null && Number.isFinite(views),
    );
  const finalSamples = comparable
    .map((candidate) => finalViews(candidate, now))
    .filter(
      (views): views is number => views != null && Number.isFinite(views),
    );
  const norm24h =
    views24Samples.length >= TELEGRAM_POST_PERFORMANCE_MIN_SAMPLE
      ? median(views24Samples)
      : null;
  const rawNormFinal =
    finalSamples.length >= TELEGRAM_POST_PERFORMANCE_MIN_SAMPLE
      ? median(finalSamples)
      : null;
  const normFinal = rawNormFinal != null && rawNormFinal >= 50 ? rawNormFinal : null;
  const normReason =
    views24Samples.length < TELEGRAM_POST_PERFORMANCE_MIN_SAMPLE ||
    (matured && finalSamples.length < TELEGRAM_POST_PERFORMANCE_MIN_SAMPLE)
    || (matured && rawNormFinal != null && rawNormFinal < 50)
      ? 'NOT_ENOUGH_DATA'
      : null;
  const engagementTotal =
    current24.reactions == null &&
    current24.forwards == null &&
    current24.comments == null
      ? null
      : (current24.reactions ?? 0) +
        (current24.forwards ?? 0) +
        (current24.comments ?? 0);
  const engagementPer1k24h =
    current24.views != null && current24.views > 0 && engagementTotal != null
      ? (engagementTotal / current24.views) * 1000
      : null;
  const score = (views: number | null, norm: number | null) =>
    views != null && norm != null && norm > 0 ? views / norm : null;

  return {
    telegramPostId: post.id,
    origin,
    publishedAt,
    views24h: current24.views,
    views72h: current72.views,
    views168h: current168.views,
    viewsFinal,
    reactions24h: current24.reactions,
    forwards24h: current24.forwards,
    comments24h: current24.comments,
    engagementPer1k24h,
    norm24h,
    score24h: score(current24.views, norm24h),
    normFinal,
    scoreFinal:
      matured && finalSamples.length >= TELEGRAM_POST_PERFORMANCE_MIN_SAMPLE
        ? score(viewsFinal, normFinal)
        : null,
    normSampleSize: views24Samples.length,
    normReason,
    lengthChars,
    lengthBand: telegramPostLengthBand(lengthChars),
    hasMedia: post.hasMedia,
    mediaKind: post.mediaKind,
    hasLink: /https?:\/\/|t\.me\//i.test(
      `${post.formattedText ?? ''} ${post.text ?? ''}`,
    ),
    endsWithQuestion: /[?？]\s*$/.test(body),
    publishHour: publish.hour,
    publishWeekday: publish.weekday,
    excludedFromNorm: excludedReason != null,
    excludedReason,
    manualClassification: post.manualClassification ?? null,
    methodVersion: TELEGRAM_POST_PERFORMANCE_METHOD_VERSION,
    computedAt: now,
  };
}
