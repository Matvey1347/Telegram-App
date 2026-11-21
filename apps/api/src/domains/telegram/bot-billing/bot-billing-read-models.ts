import { BotBillingProviderMode } from '@prisma/client';
import type {
  BotBillingOverviewView,
  BotBillingSubscriberPage,
  BotBillingUserPage,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { BillingSubscribersQueryDto, BillingUsersQueryDto } from './dto';
import { BotBillingAnalyticsService } from './bot-billing-analytics.service';

function supportLocale(
  profileLocale?: string | null,
  telegramLocale?: string | null,
): 'en' | 'uk' | 'ru' {
  const locale = (profileLocale || telegramLocale || 'en')
    .toLowerCase()
    .split(/[-_]/u)[0];
  return locale === 'uk' || locale === 'ru' ? locale : 'en';
}

export class BotBillingReadModels {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: BotBillingAnalyticsService,
    private readonly bot: (
      userId: string,
      botIntegrationId: string,
    ) => Promise<{ id: string; workspaceId: string }>,
  ) {}

  async overview(
    userId: string,
    botIntegrationId: string,
    environment: 'LOCAL' | 'PRODUCTION' = 'PRODUCTION',
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    const botScope = { botIntegrationId, workspaceId: bot.workspaceId };
    const runtimeScope = { runtimeInstance: { is: { environment } } };
    const subscriptionScope = { telegramBotUser: runtimeScope };
    const [
      subscriptionMetrics,
      registeredUsers,
      revenue,
      recentEvents,
      recentSubscriptions,
      aiUsage,
    ] = await Promise.all([
      this.prisma.botSubscription.findMany({
        where: { ...botScope, ...subscriptionScope },
        select: {
          telegramBotUserId: true,
          source: true,
          status: true,
          currency: true,
          interval: true,
          amountMinor: true,
          currentPeriodEnd: true,
          providerSubscription: { select: { mode: true } },
        },
      }),
      this.prisma.telegramBotUser.count({
        where: { ...botScope, ...runtimeScope },
      }),
      this.prisma.botBillingEvent.groupBy({
        by: ['currency'],
        where: {
          ...botScope,
          subscription: { is: subscriptionScope },
          type: 'PAYMENT_SUCCEEDED',
          mode: BotBillingProviderMode.LIVE,
        },
        _sum: { amountMinor: true },
      }),
      this.prisma.botBillingEvent.findMany({
        where: {
          ...botScope,
          subscription: { is: subscriptionScope },
          type: { in: ['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED'] },
        },
        orderBy: { occurredAt: 'desc' },
        take: 12,
        select: {
          id: true,
          type: true,
          occurredAt: true,
          subscriptionId: true,
          amountMinor: true,
          currency: true,
          subscription: {
            select: {
              telegramBotUser: {
                select: {
                  id: true,
                  telegramUserId: true,
                  username: true,
                  firstName: true,
                },
              },
              plan: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.botSubscription.findMany({
        where: { ...botScope, ...subscriptionScope },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          createdAt: true,
          amountMinor: true,
          currency: true,
          telegramBotUser: {
            select: {
              id: true,
              telegramUserId: true,
              username: true,
              firstName: true,
            },
          },
          plan: { select: { id: true, name: true } },
        },
      }),
      this.analytics.aiUsage(bot.workspaceId, botIntegrationId, environment),
    ]);
    const analytics = this.analytics.calculate(
      registeredUsers,
      subscriptionMetrics,
    );
    analytics.collectedRevenue = revenue.map((row) => ({
      currency: row.currency,
      amountMinor: row._sum.amountMinor || 0,
    }));
    const recentActivity = [
      ...recentEvents.map((event) => ({
        id: event.id,
        type:
          event.type === 'PAYMENT_SUCCEEDED'
            ? ('PAYMENT_SUCCEEDED' as const)
            : ('PAYMENT_FAILED' as const),
        occurredAt: event.occurredAt,
        subscriptionId: event.subscriptionId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        subscriber: event.subscription?.telegramBotUser || null,
        plan: event.subscription?.plan || null,
      })),
      ...recentSubscriptions.map((subscription) => ({
        id: `subscription:${subscription.id}`,
        type: 'SUBSCRIPTION' as const,
        occurredAt: subscription.createdAt,
        subscriptionId: subscription.id,
        amountMinor: subscription.amountMinor,
        currency: subscription.currency,
        subscriber: subscription.telegramBotUser,
        plan: subscription.plan,
      })),
    ]
      .sort(
        (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
      )
      .slice(0, 16);
    return {
      analytics: {
        ...analytics,
        conversionRate: registeredUsers
          ? analytics.paidUsers / registeredUsers
          : 0,
      },
      aiUsage,
      recentActivity: recentActivity.map((item) => ({
        ...item,
        occurredAt: item.occurredAt.toISOString(),
      })),
    } satisfies BotBillingOverviewView;
  }

  async plans(userId: string, botIntegrationId: string) {
    const bot = await this.bot(userId, botIntegrationId);
    return this.prisma.botSubscriptionPlan.findMany({
      where: { botIntegrationId, workspaceId: bot.workspaceId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        prices: {
          select: {
            id: true,
            currency: true,
            interval: true,
            amountMinor: true,
            version: true,
            isPublic: true,
            isActive: true,
          },
          orderBy: [
            { currency: 'asc' },
            { interval: 'asc' },
            { version: 'desc' },
          ],
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async coupons(userId: string, botIntegrationId: string) {
    const bot = await this.bot(userId, botIntegrationId);
    const rows = await this.prisma.botCoupon.findMany({
      where: { botIntegrationId, workspaceId: bot.workspaceId },
      select: {
        id: true,
        code: true,
        planId: true,
        percentOff: true,
        amountOffMinor: true,
        currency: true,
        startsAt: true,
        expiresAt: true,
        maxRedemptions: true,
        newUsersOnly: true,
        isActive: true,
        createdAt: true,
        plan: { select: { id: true, name: true } },
        _count: { select: { redemptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ _count, ...row }) => ({
      ...row,
      redemptionCount: _count.redemptions,
    }));
  }

  async subscribers(
    userId: string,
    botIntegrationId: string,
    query: BillingSubscribersQueryDto,
  ): Promise<BotBillingSubscriberPage> {
    const bot = await this.bot(userId, botIntegrationId);
    const limit = Math.min(query.limit || 25, 100);
    const where = {
      workspaceId: bot.workspaceId,
      botIntegrationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.provider
        ? {
            providerSubscription: {
              is: { provider: query.provider },
            },
          }
        : {}),
      ...(query.search?.trim()
        ? {
            telegramBotUser: {
              is: {
                ...(query.search?.trim()
                  ? {
                      OR: [
                        {
                          username: {
                            contains: query.search.trim(),
                            mode: 'insensitive' as const,
                          },
                        },
                        {
                          firstName: {
                            contains: query.search.trim(),
                            mode: 'insensitive' as const,
                          },
                        },
                        { telegramUserId: { contains: query.search.trim() } },
                      ],
                    }
                  : {}),
              },
            },
          }
        : {}),
    };
    const rows = await this.prisma.botSubscription.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        source: true,
        status: true,
        amountMinor: true,
        currency: true,
        interval: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        createdAt: true,
        telegramBotUser: {
          select: {
            id: true,
            telegramUserId: true,
            username: true,
            firstName: true,
          },
        },
        plan: { select: { id: true, name: true } },
        providerSubscription: { select: { provider: true } },
      },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        id: row.id,
        user: row.telegramBotUser,
        plan: row.plan,
        amountMinor: row.amountMinor,
        currency: row.currency,
        interval: row.interval,
        source: row.source,
        provider: row.providerSubscription?.provider || null,
        status: row.status,
        currentPeriodStart: row.currentPeriodStart?.toISOString() || null,
        currentPeriodEnd: row.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit ? page.at(-1)?.id || null : null,
    };
  }

  async users(
    userId: string,
    botIntegrationId: string,
    query: BillingUsersQueryDto,
  ): Promise<BotBillingUserPage> {
    const bot = await this.bot(userId, botIntegrationId);
    const limit = Math.min(query.limit || 25, 100);
    const rows = await this.prisma.telegramBotUser.findMany({
      where: {
        workspaceId: bot.workspaceId,
        botIntegrationId,
        runtimeInstance: {
          is: { environment: query.environment ?? 'PRODUCTION' },
        },
        ...(query.search?.trim()
          ? {
              OR: [
                {
                  username: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
                {
                  firstName: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
                {
                  lastName: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
                { telegramUserId: { contains: query.search.trim() } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastInteractionAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        telegramUserId: true,
        username: true,
        firstName: true,
        lastName: true,
        languageCode: true,
        firstSeenAt: true,
        lastInteractionAt: true,
        runtimeInstance: { select: { environment: true } },
        financeProfiles: {
          where: { botIntegrationId },
          take: 1,
          select: {
            id: true,
            locale: true,
            defaultCurrency: true,
            timezone: true,
            onboardingCompletedAt: true,
          },
        },
        billingSubscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            source: true,
            currentPeriodEnd: true,
            plan: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map(
        ({
          financeProfiles,
          billingSubscriptions,
          runtimeInstance,
          ...row
        }) => ({
          ...row,
          environment: runtimeInstance!.environment,
          firstSeenAt: row.firstSeenAt.toISOString(),
          lastInteractionAt: row.lastInteractionAt.toISOString(),
          profile: financeProfiles[0]
            ? {
                id: financeProfiles[0].id,
                locale: supportLocale(
                  financeProfiles[0].locale,
                  row.languageCode,
                ),
                defaultCurrency: financeProfiles[0].defaultCurrency,
                timezone: financeProfiles[0].timezone,
                onboardingCompleted: Boolean(
                  financeProfiles[0].onboardingCompletedAt,
                ),
              }
            : null,
          subscription: billingSubscriptions[0]
            ? {
                ...billingSubscriptions[0],
                currentPeriodEnd:
                  billingSubscriptions[0].currentPeriodEnd?.toISOString() ||
                  null,
              }
            : null,
        }),
      ),
      nextCursor: rows.length > limit ? page.at(-1)?.id || null : null,
    };
  }
}
