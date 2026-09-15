import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TelegramChannelAudienceTrend,
  TelegramChannelTrendMetric,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';

const DEFAULT_TREND_PERIOD_DAYS = 7;

type AudienceTrendRow = {
  telegramChannelId: string;
  currentAt: Date;
  currentSubscribers: number | null;
  currentActiveSubscribers: number | null;
  currentViewRate: number | null;
  latestViews: number | null;
  latestReactions: number | null;
  viewValues: number[] | null;
  reactionValues: number[] | null;
  dataQuality: string;
  dataQualityReason: string | null;
  hasExternalTrafficAnomaly: boolean;
  hasSubscriberBasePollution: boolean;
  postsWindow: number;
  baselineAt: Date | null;
  baselineSubscribers: number | null;
};

export type TelegramChannelAudienceSnapshotPreview = {
  subscribersCount: number | null;
  activeSubscribersEstimate: number | null;
  viewRate: number | null;
  avgViewsAdjusted: number | null;
  avgReactionsAdjusted: number | null;
  dataQuality: string;
  dataQualityReason: string | null;
  hasExternalTrafficAnomaly: boolean;
  hasSubscriberBasePollution: boolean;
  postsWindow: number;
};

export type TelegramChannelAudienceTrendPreview = {
  latest: TelegramChannelAudienceSnapshotPreview;
  trend: TelegramChannelAudienceTrend | null;
};

@Injectable()
export class TelegramChannelAudienceTrendReadService {
  constructor(private readonly prisma: PrismaService) {}

  async summariesForChannels(
    workspaceId: string,
    channelIds: string[],
    periodDays = DEFAULT_TREND_PERIOD_DAYS,
    now = new Date(),
  ) {
    if (!channelIds.length) {
      return new Map<string, TelegramChannelAudienceTrendPreview>();
    }

    const periodStart = startOfUtcDay(subtractUtcDays(now, periodDays - 1));
    const requestedChannels = Prisma.join(
      channelIds.map((channelId) => Prisma.sql`(${channelId})`),
    );
    const rows = await this.prisma.$queryRaw<AudienceTrendRow[]>(Prisma.sql`
      WITH requested("telegramChannelId") AS (
        VALUES ${requestedChannels}
      )
      SELECT
        requested."telegramChannelId",
        latest."collectedAt" AS "currentAt",
        latest."subscribersCount" AS "currentSubscribers",
        latest."activeSubscribersEstimate" AS "currentActiveSubscribers",
        latest."viewRate" AS "currentViewRate",
        latest."avgViewsAdjusted" AS "latestViews",
        latest."avgReactionsAdjusted" AS "latestReactions",
        post_trend."viewValues",
        post_trend."reactionValues",
        latest."dataQuality",
        latest."dataQualityReason",
        latest."hasExternalTrafficAnomaly",
        latest."hasSubscriberBasePollution",
        latest."postsWindow",
        baseline."collectedAt" AS "baselineAt",
        baseline."subscribersCount" AS "baselineSubscribers"
      FROM requested
      JOIN "TelegramChannel" channel
        ON channel."id" = requested."telegramChannelId"
        AND channel."workspaceId" = ${workspaceId}
      JOIN LATERAL (
        SELECT
          snapshot."collectedAt",
          snapshot."subscribersCount",
          snapshot."activeSubscribersEstimate",
          snapshot."viewRate",
          snapshot."avgViewsAdjusted",
          snapshot."avgReactionsAdjusted",
          snapshot."dataQuality",
          snapshot."dataQualityReason",
          snapshot."hasExternalTrafficAnomaly",
          snapshot."hasSubscriberBasePollution",
          snapshot."postsWindow"
        FROM "TelegramChannelAudienceSnapshot" snapshot
        WHERE snapshot."workspaceId" = ${workspaceId}
          AND snapshot."telegramChannelId" = requested."telegramChannelId"
          AND snapshot."collectedAt" >= ${periodStart}
          AND snapshot."collectedAt" <= ${now}
        ORDER BY snapshot."collectedAt" DESC, snapshot."id" DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          snapshot."collectedAt",
          snapshot."subscribersCount",
          snapshot."avgViewsAdjusted",
          snapshot."avgReactionsAdjusted"
        FROM "TelegramChannelAudienceSnapshot" snapshot
        WHERE snapshot."workspaceId" = ${workspaceId}
          AND snapshot."telegramChannelId" = requested."telegramChannelId"
          AND snapshot."collectedAt" >= ${periodStart}
          AND snapshot."collectedAt" <= ${now}
        ORDER BY snapshot."collectedAt", snapshot."id"
        LIMIT 1
      ) baseline ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(daily."averageViews" ORDER BY daily."date")
            FILTER (WHERE daily."averageViews" IS NOT NULL) AS "viewValues",
          ARRAY_AGG(daily."averageReactions" ORDER BY daily."date")
            FILTER (WHERE daily."averageReactions" IS NOT NULL) AS "reactionValues"
        FROM (
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
            ) FILTER (WHERE observed."reactionsCount" IS NOT NULL) AS "averageReactions"
          FROM "TelegramPost" post
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
            AND post."telegramChannelId" = requested."telegramChannelId"
            AND post."excludeFromAnalytics" = FALSE
            AND post."postDate" >= ${periodStart}
            AND post."postDate" <= ${now}
          GROUP BY DATE_TRUNC('day', post."postDate")
        ) daily
      ) post_trend ON TRUE
    `);

    return new Map(
      rows.map((row) => [
        row.telegramChannelId,
        {
          latest: {
            subscribersCount: row.currentSubscribers,
            activeSubscribersEstimate: row.currentActiveSubscribers,
            viewRate: row.currentViewRate,
            avgViewsAdjusted: row.latestViews,
            avgReactionsAdjusted: row.latestReactions,
            dataQuality: row.dataQuality,
            dataQualityReason: row.dataQualityReason,
            hasExternalTrafficAnomaly: row.hasExternalTrafficAnomaly,
            hasSubscriberBasePollution: row.hasSubscriberBasePollution,
            postsWindow: row.postsWindow,
          },
          trend: this.buildTrend(row, periodDays),
        },
      ]),
    );
  }

  private buildTrend(
    row: AudienceTrendRow,
    periodDays: number,
  ): TelegramChannelAudienceTrend | null {
    const subscribers =
      row.baselineAt && row.baselineAt.getTime() !== row.currentAt.getTime()
        ? metric(row.currentSubscribers, row.baselineSubscribers, 0)
        : null;
    const reach = halfPeriodMetric(row.viewValues, 1);
    const reactions = halfPeriodMetric(row.reactionValues, 1);
    if (!subscribers && !reach && !reactions) return null;

    return {
      periodDays,
      currentAt: row.currentAt.toISOString(),
      baselineAt: (row.baselineAt ?? row.currentAt).toISOString(),
      metrics: { subscribers, reach, reactions },
    };
  }
}

function halfPeriodMetric(values: number[] | null, digits: number) {
  const numericValues = (values ?? [])
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (numericValues.length < 2) return null;
  const split = Math.max(1, Math.floor(numericValues.length / 2));
  return metric(
    average(numericValues.slice(split)),
    average(numericValues.slice(0, split)),
    digits,
  );
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function subtractUtcDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function metric(
  current: number | null,
  previous: number | null,
  digits: number,
): TelegramChannelTrendMetric | null {
  if (current == null || previous == null) return null;
  const absoluteChange = round(current - previous, digits);
  return {
    current: round(current, digits),
    previous: round(previous, digits),
    absoluteChange,
    percentChange:
      previous === 0
        ? null
        : round((absoluteChange / Math.abs(previous)) * 100, 1),
  };
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
