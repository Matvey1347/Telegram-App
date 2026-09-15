import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TelegramChannelPerformanceHistory,
  TelegramChannelPerformanceHistoryPoint,
  TelegramChannelPerformanceHistoryRange,
} from '@telegram-system/shared';
import { CurrencyConversionService } from '../../../common/currency-conversion.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isChannelAdvertisingExpenseTransaction,
  isChannelAdvertisingRevenueTransaction,
  isChannelPurchaseTransaction,
} from './telegram-channel-financial-row-classification';
import {
  resolveChannelCardExpectedViews,
  TelegramChannelAdPricingReadService,
} from './telegram-channel-ad-pricing-read.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';

const DEFAULT_HISTORY_RANGE: TelegramChannelPerformanceHistoryRange = '7d';

type AudienceHistoryRow = {
  collectedAt: Date;
  subscribers: number | null;
};

type DailyPostHistoryRow = {
  date: Date;
  averageViews: number | null;
  averageReactions: number | null;
  postsPublished: number;
};

type FinancialEvent = {
  at: Date;
  invested: number;
  revenue: number;
};

type FinancialAmountRow = {
  amount: unknown;
  currency: string;
  amountInPrimaryCurrency: unknown;
};

@Injectable()
export class TelegramChannelPerformanceHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TelegramChannelsSupportService,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly adPricingReadService: TelegramChannelAdPricingReadService,
  ) {}

  async history(
    userId: string,
    channelId: string,
    requestedRange: TelegramChannelPerformanceHistoryRange = DEFAULT_HISTORY_RANGE,
    now = new Date(),
  ): Promise<TelegramChannelPerformanceHistory> {
    const workspaceId = await this.support.workspace(userId);
    const range = normalizeRange(requestedRange);
    const periodDays =
      range === '1d'
        ? 1
        : range === '7d'
          ? 7
          : range === '30d'
            ? 30
            : range === '90d'
              ? 90
              : null;
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: {
        id: true,
        purchaseTransactionId: true,
        createdAt: true,
        currentSubscribersCount: true,
        ownViewsPerPost: true,
        ownReactionsPerPost: true,
        adBaseCpm: true,
        adBaseCurrency: true,
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const visibleFrom = startOfUtcDay(
      periodDays == null
        ? channel.createdAt
        : subtractUtcDays(now, periodDays - 1),
    );
    const queryFrom =
      range === '1d' ? subtractUtcDays(visibleFrom, 1) : visibleFrom;
    const [
      audienceRows,
      dailyPostRows,
      transactions,
      allocations,
      workspace,
      pricingWindowsByChannel,
    ] = await Promise.all([
      this.prisma.$queryRaw<AudienceHistoryRow[]>(Prisma.sql`
          WITH ranked AS (
            SELECT
              snapshot."id",
              snapshot."collectedAt",
              snapshot."subscribersCount" AS "subscribers",
              ROW_NUMBER() OVER (
                PARTITION BY DATE_TRUNC('day', snapshot."collectedAt")
                ORDER BY snapshot."collectedAt", snapshot."id"
              ) AS "firstRank",
              ROW_NUMBER() OVER (
                PARTITION BY DATE_TRUNC('day', snapshot."collectedAt")
                ORDER BY snapshot."collectedAt" DESC, snapshot."id" DESC
              ) AS "lastRank",
              ROW_NUMBER() OVER (
                PARTITION BY DATE_TRUNC('day', snapshot."collectedAt")
                ORDER BY snapshot."subscribersCount", snapshot."collectedAt", snapshot."id"
              ) AS "minRank",
              ROW_NUMBER() OVER (
                PARTITION BY DATE_TRUNC('day', snapshot."collectedAt")
                ORDER BY snapshot."subscribersCount" DESC, snapshot."collectedAt", snapshot."id"
              ) AS "maxRank"
            FROM "TelegramChannelAudienceSnapshot" snapshot
            WHERE snapshot."workspaceId" = ${workspaceId}
              AND snapshot."telegramChannelId" = ${channelId}
              AND snapshot."subscribersCount" IS NOT NULL
              AND snapshot."collectedAt" >= ${queryFrom}
              AND snapshot."collectedAt" <= ${now}
          )
          SELECT "collectedAt", "subscribers"
          FROM ranked
          WHERE "firstRank" = 1
            OR "lastRank" = 1
            OR "minRank" = 1
            OR "maxRank" = 1
          ORDER BY "collectedAt"
        `),
      this.prisma.$queryRaw<DailyPostHistoryRow[]>(Prisma.sql`
          SELECT
            DATE_TRUNC('day', post."postDate") AS "date",
            AVG(
              GREATEST(
                0,
                observed."viewsCount" - ${channel.ownViewsPerPost} - post."manualOwnViews"
              )::DOUBLE PRECISION
            ) AS "averageViews",
            AVG(
              GREATEST(
                0,
                observed."reactionsCount" - ${channel.ownReactionsPerPost} - post."manualOwnReactions"
              )::DOUBLE PRECISION
            ) FILTER (WHERE observed."reactionsCount" IS NOT NULL) AS "averageReactions",
            COUNT(*)::INTEGER AS "postsPublished"
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
            AND post."telegramChannelId" = ${channelId}
            AND post."excludeFromAnalytics" = FALSE
            AND post."postDate" >= ${queryFrom}
            AND post."postDate" <= ${now}
          GROUP BY DATE_TRUNC('day', post."postDate")
          ORDER BY "date"
        `),
      this.prisma.transaction.findMany({
        where: {
          workspaceId,
          OR: [
            { telegramChannelId: channelId },
            ...(channel.purchaseTransactionId
              ? [{ id: channel.purchaseTransactionId }]
              : []),
            {
              adCampaign: {
                telegramChannelId: channelId,
                excludeFromAnalytics: false,
              },
            },
          ],
        },
        select: {
          id: true,
          type: true,
          date: true,
          amount: true,
          currency: true,
          amountInPrimaryCurrency: true,
          categoryRef: { select: { key: true, name: true } },
          telegramAdSalePayment: { select: { id: true } },
        },
      }),
      this.prisma.telegramAdSalePaymentAllocation.findMany({
        where: {
          workspaceId,
          placement: { telegramChannelId: channelId },
          payment: { status: 'ACTIVE' },
        },
        select: {
          amount: true,
          currency: true,
          amountInPrimaryCurrency: true,
          payment: { select: { paidAt: true } },
        },
      }),
      this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { primaryCurrency: true },
      }),
      this.adPricingReadService.windowsForChannels(workspaceId, [channel], now),
    ]);

    const primaryCurrency = workspace?.primaryCurrency ?? 'USD';
    const financialRows: FinancialAmountRow[] = [
      ...transactions,
      ...allocations,
    ];
    const needsCurrencyConversion = financialRows.some(
      (row) => row.currency.toUpperCase() !== primaryCurrency.toUpperCase(),
    );
    const rateSource = needsCurrencyConversion
      ? await this.currencyConversionService.prepareRateSource(workspaceId)
      : null;
    const amountInHistoryCurrency = async (row: FinancialAmountRow) => {
      const amount = Number(row.amount);
      const sourceCurrency = row.currency.toUpperCase();
      if (Number.isFinite(amount)) {
        if (sourceCurrency === primaryCurrency.toUpperCase()) return amount;
        const converted = await rateSource?.convertCurrency(
          amount,
          sourceCurrency,
          primaryCurrency,
        );
        if (converted != null && Number.isFinite(converted)) return converted;
      }
      const normalized = Number(row.amountInPrimaryCurrency);
      return Number.isFinite(normalized) ? normalized : null;
    };

    const events: FinancialEvent[] = [];
    for (const transaction of transactions) {
      const amount = await amountInHistoryCurrency(transaction);
      if (amount == null) continue;
      if (
        isChannelPurchaseTransaction(
          transaction,
          channel.purchaseTransactionId,
        ) ||
        isChannelAdvertisingExpenseTransaction(transaction)
      ) {
        events.push({ at: transaction.date, invested: amount, revenue: 0 });
      } else if (isChannelAdvertisingRevenueTransaction(transaction)) {
        events.push({ at: transaction.date, invested: 0, revenue: amount });
      }
    }
    for (const allocation of allocations) {
      const amount = await amountInHistoryCurrency(allocation);
      if (amount == null) continue;
      events.push({
        at: allocation.payment.paidAt,
        invested: 0,
        revenue: amount,
      });
    }
    events.sort((left, right) => left.at.getTime() - right.at.getTime());
    const sourceCpm =
      channel.adBaseCpm == null ? null : Number(channel.adBaseCpm);
    const sourceCurrency = (
      channel.adBaseCurrency || primaryCurrency
    ).toUpperCase();
    const currentCpm =
      sourceCpm == null || !Number.isFinite(sourceCpm)
        ? null
        : sourceCurrency === primaryCurrency.toUpperCase()
          ? sourceCpm
          : await this.currencyConversionService.convertCurrency(
              sourceCpm,
              sourceCurrency,
              primaryCurrency,
              workspaceId,
            );
    const currentH24ExpectedViews = resolveChannelCardExpectedViews(
      pricingWindowsByChannel.get(channel.id),
      channel,
    );

    const historyPoints = buildHistoryPoints(
      audienceRows,
      dailyPostRows,
      events,
      queryFrom,
      now,
      currentCpm,
      currentH24ExpectedViews,
    );
    return {
      range,
      periodDays,
      currency: primaryCurrency,
      points: historyPoints.filter(
        (point) => new Date(point.date) >= visibleFrom,
      ),
      comparisonPoint:
        range === '1d'
          ? buildPreviousDayComparison(historyPoints, visibleFrom)
          : null,
    };
  }
}

function buildPreviousDayComparison(
  points: TelegramChannelPerformanceHistoryPoint[],
  visibleFrom: Date,
): TelegramChannelPerformanceHistory['comparisonPoint'] {
  const previousPoints = points.filter(
    (point) => new Date(point.date) < visibleFrom,
  );
  if (!previousPoints.length) return null;
  const subscribers = lastMetricValue(previousPoints, 'subscribers');
  const averageViews = lastMetricValue(previousPoints, 'averageViews');
  const averageReactions = lastMetricValue(previousPoints, 'averageReactions');
  if (subscribers == null && averageViews == null && averageReactions == null) {
    return null;
  }
  return {
    date: previousPoints.at(-1)!.date,
    subscribers,
    averageViews,
    averageReactions,
  };
}

function lastMetricValue(
  points: TelegramChannelPerformanceHistoryPoint[],
  metric: 'subscribers' | 'averageViews' | 'averageReactions',
) {
  return (
    points
      .map((point) => point[metric])
      .filter(
        (value): value is number => value != null && Number.isFinite(value),
      )
      .at(-1) ?? null
  );
}

function buildHistoryPoints(
  audienceRows: AudienceHistoryRow[],
  dailyPostRows: DailyPostHistoryRow[],
  events: FinancialEvent[],
  from: Date,
  now: Date,
  currentCpm: number | null,
  currentH24ExpectedViews: number | null,
): TelegramChannelPerformanceHistoryPoint[] {
  const audienceByInstant = new Map(
    audienceRows.map((row) => [row.collectedAt.toISOString(), row]),
  );
  const postsByDay = new Map(
    dailyPostRows.map((row) => [dayKey(row.date), row]),
  );
  const instants = new Set<string>();
  for (const row of audienceRows) instants.add(row.collectedAt.toISOString());
  for (const row of dailyPostRows) {
    const instant = startOfUtcDay(row.date);
    if (instant >= from && instant <= now) instants.add(instant.toISOString());
  }
  for (const event of events) {
    if (event.at >= from && event.at <= now)
      instants.add(event.at.toISOString());
  }
  // Anchor financial charts at both edges of the selected range. This keeps
  // the carried balance visible before the first in-range transaction and
  // guarantees that the final point matches today's card calculation.
  instants.add(from.toISOString());
  instants.add(now.toISOString());

  let eventIndex = 0;
  let invested = 0;
  let revenue = 0;
  let carriedExpectedViews: number | null = null;
  return [...instants].sort().map((instant) => {
    const timestamp = new Date(instant);
    const date = dayKey(timestamp);
    const isDayPoint = instant.endsWith('T00:00:00.000Z');
    const cutoff = timestamp.getTime();
    while (
      eventIndex < events.length &&
      events[eventIndex].at.getTime() <= cutoff
    ) {
      invested += events[eventIndex].invested;
      revenue += events[eventIndex].revenue;
      eventIndex += 1;
    }
    const audience = audienceByInstant.get(instant);
    const dailyPosts = isDayPoint ? postsByDay.get(date) : undefined;
    if (
      dailyPosts?.averageViews != null &&
      Number.isFinite(Number(dailyPosts.averageViews)) &&
      Number(dailyPosts.averageViews) > 0
    ) {
      carriedExpectedViews = Number(dailyPosts.averageViews);
    }
    const isCurrentPoint = timestamp.getTime() === now.getTime();
    const expectedViews = isCurrentPoint
      ? currentH24ExpectedViews
      : (carriedExpectedViews ?? currentH24ExpectedViews);
    const estimatedAdPrice =
      currentCpm != null &&
      Number.isFinite(currentCpm) &&
      currentCpm > 0 &&
      expectedViews != null &&
      expectedViews > 0
        ? (expectedViews / 1000) * currentCpm
        : null;
    const remaining = Math.max(invested - revenue, 0);
    return {
      date: instant,
      subscribers: audience?.subscribers ?? null,
      averageViews:
        dailyPosts?.averageViews == null
          ? null
          : round(Number(dailyPosts.averageViews), 1),
      averageReactions:
        dailyPosts?.averageReactions == null
          ? null
          : round(Number(dailyPosts.averageReactions), 1),
      postsPublished: dailyPosts?.postsPublished ?? null,
      invested: round(invested, 2),
      revenue: round(revenue, 2),
      paybackPercent:
        invested > 0 ? round((revenue / invested) * 100, 1) : null,
      adsLeft:
        estimatedAdPrice == null
          ? null
          : isCurrentPoint
            ? Math.ceil(remaining / estimatedAdPrice)
            : round(remaining / estimatedAdPrice, 1),
    };
  });
}

function normalizeRange(
  value: TelegramChannelPerformanceHistoryRange,
): TelegramChannelPerformanceHistoryRange {
  return value === '1d' ||
    value === '7d' ||
    value === '30d' ||
    value === '90d' ||
    value === 'all'
    ? value
    : DEFAULT_HISTORY_RANGE;
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
