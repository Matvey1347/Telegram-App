import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import {
  BotBillingProviderMode,
  BotSubscriptionStatus,
  FinanceAiProvider,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { BotEntitlementsService } from '../../bot-billing/bot-entitlements.service';
import {
  FINANCE_CAPABILITIES,
  FINANCE_PRODUCT_DEFINITIONS,
  type FinanceTier,
} from './finance-product-definition';

/**
 * The Finance vocabulary stays here while subscription state stays in the
 * reusable billing resolver. Premium handlers should ask this service for a
 * capability instead of interpreting provider statuses themselves.
 */
export { FINANCE_PRODUCT_DEFINITIONS } from './finance-product-definition';
export type FinanceCapability = (typeof FINANCE_CAPABILITIES)[number];
export type FinanceUsageFeature = 'AI_INPUT' | 'RECEIPT_SCAN' | 'AI_INSIGHTS';

@Injectable()
export class FinanceEntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingEntitlements?: BotEntitlementsService,
  ) {}

  async resolve(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    profileId?: string;
  }) {
    const access = await this.access(input);
    const profileId =
      input.profileId ||
      (
        await this.prisma.financeProfile.findUnique({
          where: {
            botIntegrationId_telegramBotUserId: {
              botIntegrationId: input.botIntegrationId,
              telegramBotUserId: input.telegramBotUserId,
            },
          },
          select: { id: true },
        })
      )?.id;
    const tracked: readonly FinanceUsageFeature[] =
      access.tier === 'ULTIMATE'
        ? ['AI_INPUT', 'RECEIPT_SCAN', 'AI_INSIGHTS']
        : ['AI_INPUT', 'RECEIPT_SCAN'];
    const usage = profileId
      ? await Promise.all(
          tracked.map((feature) => this.usage(profileId, access.tier, feature)),
        )
      : [];
    return { ...access, usage };
  }

  async hasCapability(
    input: {
      botIntegrationId: string;
      telegramBotUserId: string;
      profileId?: string;
    },
    entitlement: FinanceCapability,
  ) {
    return (await this.access(input)).capabilities.includes(entitlement);
  }

  private async access(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
  }) {
    const now = new Date();
    const subscriptions = await this.prisma.botSubscription.findMany({
      where: {
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        status: {
          in: [BotSubscriptionStatus.ACTIVE, BotSubscriptionStatus.CANCELED],
        },
        plan: {
          is: {
            code: { in: ['FREE', 'PRO', 'ULTIMATE'], mode: 'insensitive' },
          },
        },
        OR: [
          {
            source: { in: ['STRIPE', 'TELEGRAM_STARS'] },
            currentPeriodEnd: { gt: now },
            providerSubscription: { is: { mode: BotBillingProviderMode.LIVE } },
          },
          {
            source: { in: ['MANUAL', 'GIFT'] },
            grants: {
              some: {
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
        ],
      },
      select: {
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        plan: { select: { code: true } },
        grants: { where: { revokedAt: null }, select: { expiresAt: true } },
      },
    });
    let tier = subscriptions.reduce<FinanceTier>((current, subscription) => {
      const code = subscription.plan?.code.toUpperCase() as
        | FinanceTier
        | undefined;
      return code === 'ULTIMATE' || (code === 'PRO' && current === 'FREE')
        ? code
        : current;
    }, 'FREE');
    // Existing generic billing plans remain valid while operators migrate to
    // the canonical Finance codes. Only recognised Finance capabilities opt a
    // legacy paid plan into the Finance compatibility tier.
    const legacy =
      tier === 'FREE' && this.billingEntitlements
        ? await this.billingEntitlements.resolve(input)
        : null;
    if (
      legacy?.hasPaidEntitlement &&
      legacy.capabilities.some((capability) =>
        (FINANCE_CAPABILITIES as readonly string[]).includes(capability),
      )
    )
      tier = 'PRO';
    const dates = subscriptions
      .flatMap((s) => [s.currentPeriodEnd, ...s.grants.map((g) => g.expiresAt)])
      .filter((d): d is Date => d instanceof Date);
    return {
      tier,
      capabilities: [...FINANCE_PRODUCT_DEFINITIONS[tier].capabilities],
      activeUntil: dates.length
        ? new Date(Math.max(...dates.map(Number))).toISOString()
        : legacy?.activeUntil || null,
      cancelAtPeriodEnd: subscriptions.some((s) => s.cancelAtPeriodEnd),
    };
  }

  async has(
    input: {
      botIntegrationId: string;
      telegramBotUserId: string;
      profileId?: string;
    },
    entitlement: FinanceCapability,
  ) {
    const resolved = await this.resolve(input);
    return (
      resolved.capabilities.includes(entitlement) ||
      ((entitlement === 'AI_INPUT' || entitlement === 'RECEIPT_SCAN') &&
        resolved.usage.some(
          (item) => item.feature === entitlement && item.remaining !== 0,
        ))
    );
  }

  async assertCanUse(
    input: {
      botIntegrationId: string;
      telegramBotUserId: string;
      profileId: string;
    },
    feature: FinanceUsageFeature,
  ) {
    const resolved = await this.resolve(input);
    const usage = resolved.usage.find((item) => item.feature === feature);
    if (!usage || usage.remaining === 0)
      throw new HttpException(
        'Finance usage limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return usage;
  }

  /**
   * A short-lived reservation serializes the last available request without
   * charging failures: it becomes SUCCEEDED only after the provider returns.
   * Stale reservations expire from admission after five minutes, so a process
   * crash cannot permanently consume an allowance.
   */
  async reserve(
    input: {
      botIntegrationId: string;
      telegramBotUserId: string;
      profileId: string;
    },
    feature: FinanceUsageFeature,
    model: string,
  ) {
    const access = await this.access(input);
    return this.reserveForTier(input, access.tier, feature, model);
  }

  async reserveCapability(
    input: {
      botIntegrationId: string;
      telegramBotUserId: string;
      profileId: string;
    },
    capability: FinanceCapability,
    feature: FinanceUsageFeature,
    model: string,
  ) {
    const access = await this.access(input);
    if (!access.capabilities.includes(capability)) {
      throw new ForbiddenException('Finance AI insights require Ultimate');
    }
    return this.reserveForTier(input, access.tier, feature, model);
  }

  private async reserveForTier(
    input: {
      botIntegrationId: string;
      telegramBotUserId: string;
      profileId: string;
    },
    tier: FinanceTier,
    feature: FinanceUsageFeature,
    model: string,
  ) {
    const limit = this.limit(tier, feature);
    if (limit === null) return null;
    const identity = await this.prisma.financeProfile.findFirst({
      where: {
        id: input.profileId,
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
      },
      select: {
        botIntegration: { select: { workspaceId: true } },
        telegramUser: { select: { runtimeInstanceId: true } },
      },
    });
    if (!identity) {
      throw new ForbiddenException('Finance profile identity is unavailable');
    }
    const now = new Date();
    const periodStart =
      tier === 'FREE'
        ? undefined
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const pendingAfter = new Date(now.getTime() - 5 * 60_000);
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `${input.profileId}:${feature}`);
      const reserved = await tx.aiUsageEvent.count({
        where: {
          profileId: input.profileId,
          feature,
          OR: [
            {
              status: 'SUCCEEDED',
              ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
            },
            { status: 'PENDING', createdAt: { gte: pendingAfter } },
          ],
        },
      });
      if (reserved >= limit)
        throw new HttpException(
          'Finance usage limit reached',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      return tx.aiUsageEvent.create({
        data: {
          workspaceId: identity.botIntegration.workspaceId,
          profileId: input.profileId,
          botIntegrationId: input.botIntegrationId,
          runtimeInstanceId: identity.telegramUser.runtimeInstanceId,
          telegramBotUserId: input.telegramBotUserId,
          feature,
          provider: FinanceAiProvider.OPENAI,
          model,
          latencyMs: 0,
          status: 'PENDING',
        },
        select: { id: true },
      });
    });
  }

  private async usage(
    profileId: string,
    tier: FinanceTier,
    feature: FinanceUsageFeature,
  ) {
    const limit = this.limit(tier, feature);
    const monthly = limit !== null && tier !== 'FREE';
    const now = new Date();
    const start = monthly
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      : undefined;
    const used = await this.prisma.aiUsageEvent.count({
      where: {
        profileId,
        feature,
        status: 'SUCCEEDED',
        ...(start ? { createdAt: { gte: start } } : {}),
      },
    });
    return {
      feature,
      used,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - used),
      resetAt: monthly
        ? new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
          ).toISOString()
        : null,
    };
  }

  private limit(tier: FinanceTier, feature: FinanceUsageFeature) {
    return FINANCE_PRODUCT_DEFINITIONS[tier].usageLimits[feature];
  }
}
