import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TelegramChannelAudienceTrend,
  TelegramChannelTrendMetric,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';

const DEFAULT_TREND_PERIOD_DAYS = 7;
const BASELINE_GRACE_DAYS = 2;

type AudienceTrendRow = {
  telegramChannelId: string;
  currentAt: Date;
  currentSubscribers: number | null;
  currentActiveSubscribers: number | null;
  currentViewRate: number | null;
  currentViews: number | null;
  currentReactions: number | null;
  dataQuality: string;
  dataQualityReason: string | null;
  hasExternalTrafficAnomaly: boolean;
  hasSubscriberBasePollution: boolean;
  postsWindow: number;
  baselineAt: Date | null;
  baselineSubscribers: number | null;
  baselineViews: number | null;
  baselineReactions: number | null;
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
  ) {
    if (!channelIds.length) {
      return new Map<string, TelegramChannelAudienceTrendPreview>();
    }

    const maximumBaselineAgeDays = periodDays + BASELINE_GRACE_DAYS;
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
        latest."avgViewsAdjusted" AS "currentViews",
        latest."avgReactionsAdjusted" AS "currentReactions",
        latest."dataQuality",
        latest."dataQualityReason",
        latest."hasExternalTrafficAnomaly",
        latest."hasSubscriberBasePollution",
        latest."postsWindow",
        baseline."collectedAt" AS "baselineAt",
        baseline."subscribersCount" AS "baselineSubscribers",
        baseline."avgViewsAdjusted" AS "baselineViews",
        baseline."avgReactionsAdjusted" AS "baselineReactions"
      FROM requested
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
        ORDER BY snapshot."collectedAt" DESC
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
          AND snapshot."collectedAt" <= latest."collectedAt" - ${periodDays} * INTERVAL '1 day'
          AND snapshot."collectedAt" >= latest."collectedAt" - ${maximumBaselineAgeDays} * INTERVAL '1 day'
        ORDER BY snapshot."collectedAt" DESC
        LIMIT 1
      ) baseline ON TRUE
    `);

    return new Map(
      rows.map((row) => [
        row.telegramChannelId,
        {
          latest: {
            subscribersCount: row.currentSubscribers,
            activeSubscribersEstimate: row.currentActiveSubscribers,
            viewRate: row.currentViewRate,
            avgViewsAdjusted: row.currentViews,
            avgReactionsAdjusted: row.currentReactions,
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
    if (!row.baselineAt) return null;

    const subscribers = metric(
      row.currentSubscribers,
      row.baselineSubscribers,
      0,
    );
    const reach = metric(row.currentViews, row.baselineViews, 1);
    const reactions = metric(row.currentReactions, row.baselineReactions, 1);
    if (!subscribers && !reach && !reactions) return null;

    return {
      periodDays,
      currentAt: row.currentAt.toISOString(),
      baselineAt: row.baselineAt.toISOString(),
      metrics: { subscribers, reach, reactions },
    };
  }
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
