import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TelegramChannelPerformanceHistory,
  TelegramChannelPerformanceHistoryPoint,
  TelegramChannelPerformanceHistoryRange,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';

const DEFAULT_RANGE: TelegramChannelPerformanceHistoryRange = '7d';

type AudienceRow = { date: Date; subscribers: number | null };
type PostRow = {
  date: Date;
  averageViews: number | null;
  averageReactions: number | null;
  postsPublished: number;
};

@Injectable()
export class TelegramNetworkPerformanceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async history(
    workspaceId: string,
    channelIds: string[],
    requestedRange: TelegramChannelPerformanceHistoryRange = DEFAULT_RANGE,
    now = new Date(),
  ): Promise<TelegramChannelPerformanceHistory> {
    const range = normalizeRange(requestedRange);
    const periodDays = daysForRange(range);
    const ids = [...new Set(channelIds)];
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { primaryCurrency: true },
    });
    if (!ids.length) {
      return emptyHistory(range, periodDays, workspace?.primaryCurrency ?? 'USD');
    }
    const visibleFrom = startOfUtcDay(
      periodDays == null ? new Date(0) : subtractUtcDays(now, periodDays - 1),
    );
    const queryFrom = range === '1d' ? subtractUtcDays(visibleFrom, 1) : visibleFrom;
    const [audienceRows, postRows] = await Promise.all([
      this.prisma.$queryRaw<AudienceRow[]>(Prisma.sql`
        WITH latest_daily AS (
          SELECT DISTINCT ON (
            snapshot."telegramChannelId",
            DATE_TRUNC('day', snapshot."collectedAt")
          )
            DATE_TRUNC('day', snapshot."collectedAt") AS "date",
            snapshot."telegramChannelId",
            snapshot."subscribersCount" AS "subscribers"
          FROM "TelegramChannelAudienceSnapshot" snapshot
          WHERE snapshot."workspaceId" = ${workspaceId}
            AND snapshot."telegramChannelId" IN (${Prisma.join(ids)})
            AND snapshot."subscribersCount" IS NOT NULL
            AND snapshot."collectedAt" >= ${queryFrom}
            AND snapshot."collectedAt" <= ${now}
          ORDER BY
            snapshot."telegramChannelId",
            DATE_TRUNC('day', snapshot."collectedAt"),
            snapshot."collectedAt" DESC,
            snapshot."id" DESC
        )
        SELECT "date", SUM("subscribers")::DOUBLE PRECISION AS "subscribers"
        FROM latest_daily
        GROUP BY "date"
        ORDER BY "date"
      `),
      this.prisma.$queryRaw<PostRow[]>(Prisma.sql`
        SELECT
          DATE_TRUNC('day', post."postDate") AS "date",
          AVG(
            GREATEST(
              0,
              observed."viewsCount" - channel."ownViewsPerPost" - post."manualOwnViews"
            )::DOUBLE PRECISION
          ) AS "averageViews",
          AVG(
            GREATEST(
              0,
              observed."reactionsCount" - channel."ownReactionsPerPost" - post."manualOwnReactions"
            )::DOUBLE PRECISION
          ) FILTER (WHERE observed."reactionsCount" IS NOT NULL) AS "averageReactions",
          COUNT(*)::INTEGER AS "postsPublished"
        FROM "TelegramPost" post
        JOIN "TelegramChannel" channel ON channel."id" = post."telegramChannelId"
        JOIN LATERAL (
          SELECT snapshot."viewsCount", snapshot."reactionsCount"
          FROM "TelegramPostMetricSnapshot" snapshot
          WHERE snapshot."telegramPostId" = post."id"
            AND snapshot."viewsCount" IS NOT NULL
            AND snapshot."collectedAt" BETWEEN post."postDate" + INTERVAL '16 hours'
              AND post."postDate" + INTERVAL '32 hours'
            AND snapshot."collectedAt" <= ${now}
          ORDER BY ABS(EXTRACT(EPOCH FROM (
            snapshot."collectedAt" - (post."postDate" + INTERVAL '24 hours')
          ))), snapshot."collectedAt" ASC
          LIMIT 1
        ) observed ON TRUE
        WHERE post."workspaceId" = ${workspaceId}
          AND post."telegramChannelId" IN (${Prisma.join(ids)})
          AND post."excludeFromAnalytics" = FALSE
          AND post."postDate" >= ${queryFrom}
          AND post."postDate" <= ${now}
        GROUP BY DATE_TRUNC('day', post."postDate")
        ORDER BY "date"
      `),
    ]);
    const points = aggregatePoints(audienceRows, postRows, queryFrom, now);
    return {
      range,
      periodDays,
      currency: workspace?.primaryCurrency ?? 'USD',
      points: points.filter((point) => new Date(point.date) >= visibleFrom),
      comparisonPoint:
        range === '1d' ? previousDayComparison(points, visibleFrom) : null,
    };
  }
}

function aggregatePoints(
  audienceRows: AudienceRow[],
  postRows: PostRow[],
  from: Date,
  now: Date,
): TelegramChannelPerformanceHistoryPoint[] {
  const audienceByDay = new Map(audienceRows.map((row) => [dayKey(row.date), row]));
  const postsByDay = new Map(postRows.map((row) => [dayKey(row.date), row]));
  const days = new Set<string>([...audienceByDay.keys(), ...postsByDay.keys()]);
  days.add(dayKey(from));
  days.add(dayKey(now));
  return [...days]
    .sort()
    .map((day) => {
      const audience = audienceByDay.get(day);
      const posts = postsByDay.get(day);
      return {
        date: `${day}T00:00:00.000Z`,
        subscribers: audience?.subscribers == null ? null : Number(audience.subscribers),
        averageViews: posts?.averageViews == null ? null : round(Number(posts.averageViews), 1),
        averageReactions:
          posts?.averageReactions == null ? null : round(Number(posts.averageReactions), 1),
        postsPublished: posts?.postsPublished ?? null,
        invested: 0,
        revenue: 0,
        paybackPercent: null,
        adsLeft: null,
      };
    });
}

function previousDayComparison(
  points: TelegramChannelPerformanceHistoryPoint[],
  visibleFrom: Date,
): TelegramChannelPerformanceHistory['comparisonPoint'] {
  const point = points.filter((item) => new Date(item.date) < visibleFrom).at(-1);
  if (!point) return null;
  return {
    date: point.date,
    subscribers: point.subscribers,
    averageViews: point.averageViews,
    averageReactions: point.averageReactions,
  };
}

function emptyHistory(
  range: TelegramChannelPerformanceHistoryRange,
  periodDays: 1 | 7 | 30 | 90 | null,
  currency: string,
): TelegramChannelPerformanceHistory {
  return { range, periodDays, currency, points: [], comparisonPoint: null };
}

function normalizeRange(value: TelegramChannelPerformanceHistoryRange) {
  return value === '1d' || value === '7d' || value === '30d' || value === '90d' || value === 'all'
    ? value
    : DEFAULT_RANGE;
}

function daysForRange(
  range: TelegramChannelPerformanceHistoryRange,
): 1 | 7 | 30 | 90 | null {
  if (range === '1d') return 1;
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  return null;
}

function subtractUtcDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function startOfUtcDay(value: Date) {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
