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
  source: 'STRIPE' | 'TELEGRAM_STARS' | 'MANUAL' | 'GIFT';
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
    const paidSubscriptions = active.filter(
      (item) => item.source === 'STRIPE' || item.source === 'TELEGRAM_STARS',
    );
    const grantedSubscriptions = active.filter(
      (item) => item.source === 'MANUAL' || item.source === 'GIFT',
    );
    const paidUsers = new Set(
      paidSubscriptions.map((item) => item.telegramBotUserId),
    );
    const grantedUsers = new Set(
      grantedSubscriptions.map((item) => item.telegramBotUserId),
    );
    const mrr = Object.entries(
      paidSubscriptions.reduce<Record<string, number>>((totals, item) => {
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
      freeUsers: Math.max(
        0,
        registeredUsers - new Set([...paidUsers, ...grantedUsers]).size,
      ),
      paidUsers: paidUsers.size,
      grantedUsers: grantedUsers.size,
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

  async aiUsage(workspaceId: string, botIntegrationId: string) {
    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const where = { workspaceId, botIntegrationId, createdAt: { gte: periodStart }, status: { not: 'PENDING' } };
    const [summary, models, users] = await Promise.all([
      this.prisma.aiUsageEvent.aggregate({ where, _count: { _all: true, estimatedCostMicros: true }, _sum: { inputTokens: true, cachedInputTokens: true, outputTokens: true, estimatedCostMicros: true } }),
      this.prisma.aiUsageEvent.groupBy({ by: ['model'], where, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true, estimatedCostMicros: true }, orderBy: { _sum: { estimatedCostMicros: 'desc' } } }),
      this.prisma.aiUsageEvent.groupBy({ by: ['telegramBotUserId'], where: { ...where, telegramBotUserId: { not: null } }, _count: { _all: true }, _sum: { estimatedCostMicros: true }, orderBy: { _sum: { estimatedCostMicros: 'desc' } }, take: 100 }),
    ]);
    const userIds = users.flatMap((row) => row.telegramBotUserId ? [row.telegramBotUserId] : []);
    const identities = userIds.length ? await this.prisma.telegramBotUser.findMany({ where: { id: { in: userIds }, workspaceId, botIntegrationId }, select: { id: true, telegramUserId: true, username: true, firstName: true } }) : [];
    const identityById = new Map(identities.map((user) => [user.id, user]));
    return {
      periodStart: periodStart.toISOString(), requests: summary._count._all,
      inputTokens: summary._sum.inputTokens || 0, cachedInputTokens: summary._sum.cachedInputTokens || 0,
      outputTokens: summary._sum.outputTokens || 0, estimatedCostMicros: summary._sum.estimatedCostMicros || 0,
      unpricedRequests: summary._count._all - summary._count.estimatedCostMicros,
      byModel: models.map((row) => ({ model: row.model, requests: row._count._all, inputTokens: row._sum.inputTokens || 0, outputTokens: row._sum.outputTokens || 0, estimatedCostMicros: row._sum.estimatedCostMicros ?? null })),
      byUser: users.flatMap((row) => { const identity = row.telegramBotUserId ? identityById.get(row.telegramBotUserId) : null; return identity ? [{ telegramBotUserId: identity.id, telegramUserId: identity.telegramUserId, username: identity.username, firstName: identity.firstName, requests: row._count._all, estimatedCostMicros: row._sum.estimatedCostMicros ?? null }] : []; }),
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
            AND subscription."source" IN ('STRIPE', 'TELEGRAM_STARS')
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
            AND subscription."source" IN ('STRIPE', 'TELEGRAM_STARS')
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
