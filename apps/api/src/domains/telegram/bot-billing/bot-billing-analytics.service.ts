import { Injectable } from '@nestjs/common';
import {
  BotBillingProviderMode,
  BotBillingInterval,
  BotSubscriptionStatus,
  Prisma,
} from '@prisma/client';
import type { BotBillingAnalyticsView } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';

type SubscriptionMetric = {
  botIntegrationId: string;
  telegramBotUserId: string;
  status: BotSubscriptionStatus;
  currency: string | null;
  interval: BotBillingInterval | null;
  amountMinor: number | null;
  currentPeriodEnd: Date | null;
  providerSubscription: { mode: BotBillingProviderMode } | null;
};

@Injectable()
export class BotBillingAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  calculate(
    registeredUsers: number,
    subscriptions: Omit<SubscriptionMetric, 'botIntegrationId'>[],
    now = new Date(),
  ): BotBillingAnalyticsView {
    const liveSubscriptions = subscriptions.filter(
      (item) => item.providerSubscription?.mode !== BotBillingProviderMode.TEST,
    );
    const active = liveSubscriptions.filter(
      (item) =>
        item.status === BotSubscriptionStatus.ACTIVE ||
        (item.status === BotSubscriptionStatus.CANCELED &&
          item.currentPeriodEnd &&
          item.currentPeriodEnd > now),
    );
    const paidUsers = new Set(active.map((item) => item.telegramBotUserId));
    const mrr = Object.entries(
      active.reduce<Record<string, number>>((totals, item) => {
        if (item.currency && item.amountMinor) {
          totals[item.currency] =
            (totals[item.currency] || 0) +
            (item.interval === 'YEAR'
              ? item.amountMinor / 12
              : item.amountMinor);
        }
        return totals;
      }, {}),
    ).map(([currency, amountMinor]) => ({
      currency,
      amountMinor: Math.round(amountMinor),
    }));

    return {
      registeredUsers,
      activeSubscriptions: active.length,
      freeUsers: Math.max(0, registeredUsers - paidUsers.size),
      paidUsers: paidUsers.size,
      canceled: liveSubscriptions.filter(
        (item) => item.status === BotSubscriptionStatus.CANCELED,
      ).length,
      failedPayments: liveSubscriptions.filter(
        (item) => item.status === BotSubscriptionStatus.PAST_DUE,
      ).length,
      monthly: active.filter((item) => item.interval === 'MONTH').length,
      yearly: active.filter((item) => item.interval === 'YEAR').length,
      mrr,
      collectedRevenue: [],
    };
  }

  async summariesForRuntimes(workspaceId: string, runtimeIds: string[]) {
    const summaries = new Map<
      string,
      Pick<
        BotBillingAnalyticsView,
        'registeredUsers' | 'paidUsers' | 'activeSubscriptions' | 'failedPayments'
      >
    >();
    if (!runtimeIds.length) return summaries;

    const [users, subscriptionMetrics] = await Promise.all([
      this.prisma.telegramBotUser.groupBy({
        by: ['runtimeInstanceId'],
        where: { workspaceId, runtimeInstanceId: { in: runtimeIds } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<
        Array<{
          runtimeInstanceId: string;
          activeSubscriptions: number;
          paidUsers: number;
          failedPayments: number;
        }>
      >(Prisma.sql`
        SELECT
          bot_user."runtimeInstanceId" AS "runtimeInstanceId",
          COUNT(*) FILTER (WHERE
            provider_subscription."mode" IS DISTINCT FROM 'TEST'
            AND (
              subscription."status" = 'ACTIVE'
              OR (
                subscription."status" = 'CANCELED'
                AND subscription."currentPeriodEnd" > NOW()
              )
            )
          )::int AS "activeSubscriptions",
          COUNT(DISTINCT subscription."telegramBotUserId") FILTER (WHERE
            provider_subscription."mode" IS DISTINCT FROM 'TEST'
            AND (
              subscription."status" = 'ACTIVE'
              OR (
                subscription."status" = 'CANCELED'
                AND subscription."currentPeriodEnd" > NOW()
              )
            )
          )::int AS "paidUsers",
          COUNT(*) FILTER (WHERE
            provider_subscription."mode" IS DISTINCT FROM 'TEST'
            AND subscription."status" = 'PAST_DUE'
          )::int AS "failedPayments"
        FROM "BotSubscription" AS subscription
        INNER JOIN "TelegramBotUser" AS bot_user
          ON bot_user."id" = subscription."telegramBotUserId"
        LEFT JOIN "BotProviderSubscription" AS provider_subscription
          ON provider_subscription."subscriptionId" = subscription."id"
        WHERE subscription."workspaceId" = ${workspaceId}
          AND bot_user."runtimeInstanceId" IN (${Prisma.join(runtimeIds)})
        GROUP BY bot_user."runtimeInstanceId"
      `),
    ]);
    const usersByBot = new Map(
      users.map((row) => [row.runtimeInstanceId, row._count._all]),
    );
    const metricsByBot = new Map(
      subscriptionMetrics.map((row) => [row.runtimeInstanceId, row]),
    );
    for (const runtimeId of runtimeIds) {
      const metrics = metricsByBot.get(runtimeId);
      summaries.set(runtimeId, {
        registeredUsers: usersByBot.get(runtimeId) || 0,
        paidUsers: metrics?.paidUsers || 0,
        activeSubscriptions: metrics?.activeSubscriptions || 0,
        failedPayments: metrics?.failedPayments || 0,
      });
    }
    return summaries;
  }
}
