import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TelegramChannelPerformanceHistory,
  TelegramChannelPerformanceHistoryPoint,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isChannelAdvertisingExpenseTransaction,
  isChannelAdvertisingRevenueTransaction,
  isChannelPurchaseTransaction,
} from './telegram-channel-financial-row-classification';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';

const DEFAULT_HISTORY_DAYS = 90;
const MIN_HISTORY_DAYS = 7;
const MAX_HISTORY_DAYS = 365;

type AudienceHistoryRow = {
  collectedAt: Date;
  subscribers: number | null;
  averageViews: number | null;
  averageReactions: number | null;
};

type FinancialEvent = {
  at: Date;
  invested: number;
  revenue: number;
};

@Injectable()
export class TelegramChannelPerformanceHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TelegramChannelsSupportService,
  ) {}

  async history(
    userId: string,
    channelId: string,
    requestedDays = DEFAULT_HISTORY_DAYS,
    now = new Date(),
  ): Promise<TelegramChannelPerformanceHistory> {
    const workspaceId = await this.support.workspace(userId);
    const periodDays = Math.max(
      MIN_HISTORY_DAYS,
      Math.min(
        MAX_HISTORY_DAYS,
        Math.trunc(requestedDays) || DEFAULT_HISTORY_DAYS,
      ),
    );
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - periodDays + 1);
    from.setUTCHours(0, 0, 0, 0);

    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: { id: true, purchaseTransactionId: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const [audienceRows, transactions, allocations, workspace] =
      await Promise.all([
        this.prisma.$queryRaw<AudienceHistoryRow[]>(Prisma.sql`
          SELECT DISTINCT ON (DATE_TRUNC('day', snapshot."collectedAt"))
            snapshot."collectedAt",
            snapshot."subscribersCount" AS "subscribers",
            snapshot."avgViewsAdjusted" AS "averageViews",
            snapshot."avgReactionsAdjusted" AS "averageReactions"
          FROM "TelegramChannelAudienceSnapshot" snapshot
          WHERE snapshot."workspaceId" = ${workspaceId}
            AND snapshot."telegramChannelId" = ${channelId}
            AND snapshot."collectedAt" >= ${from}
            AND snapshot."collectedAt" <= ${now}
          ORDER BY DATE_TRUNC('day', snapshot."collectedAt"), snapshot."collectedAt" DESC
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
            amountInPrimaryCurrency: true,
            payment: { select: { paidAt: true } },
          },
        }),
        this.prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { primaryCurrency: true },
        }),
      ]);

    const events: FinancialEvent[] = [];
    for (const transaction of transactions) {
      const amount = Number(transaction.amountInPrimaryCurrency);
      if (!Number.isFinite(amount)) continue;
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
      const amount = Number(allocation.amountInPrimaryCurrency);
      if (!Number.isFinite(amount)) continue;
      events.push({
        at: allocation.payment.paidAt,
        invested: 0,
        revenue: amount,
      });
    }
    events.sort((left, right) => left.at.getTime() - right.at.getTime());

    return {
      periodDays,
      currency: workspace?.primaryCurrency ?? 'USD',
      points: buildHistoryPoints(audienceRows, events, from, now),
    };
  }
}

function buildHistoryPoints(
  audienceRows: AudienceHistoryRow[],
  events: FinancialEvent[],
  from: Date,
  now: Date,
): TelegramChannelPerformanceHistoryPoint[] {
  const audienceByDay = new Map(
    audienceRows.map((row) => [dayKey(row.collectedAt), row]),
  );
  const dates = new Set<string>([dayKey(from), dayKey(now)]);
  for (const row of audienceRows) dates.add(dayKey(row.collectedAt));
  for (const event of events) {
    if (event.at >= from && event.at <= now) dates.add(dayKey(event.at));
  }

  let eventIndex = 0;
  let invested = 0;
  let revenue = 0;
  return [...dates].sort().map((date) => {
    const endOfDay = new Date(`${date}T23:59:59.999Z`).getTime();
    while (
      eventIndex < events.length &&
      events[eventIndex].at.getTime() <= endOfDay
    ) {
      invested += events[eventIndex].invested;
      revenue += events[eventIndex].revenue;
      eventIndex += 1;
    }
    const audience = audienceByDay.get(date);
    return {
      date: `${date}T00:00:00.000Z`,
      subscribers: audience?.subscribers ?? null,
      averageViews: audience?.averageViews ?? null,
      averageReactions: audience?.averageReactions ?? null,
      invested: round(invested, 2),
      revenue: round(revenue, 2),
      paybackPercent:
        invested > 0 ? round((revenue / invested) * 100, 1) : null,
    };
  });
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
