import { Injectable } from '@nestjs/common';
import type { BotBillingEntitlements } from '@telegram-system/shared';
import {
  BotBillingProviderMode,
  BotSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class BotEntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: { botIntegrationId: string; telegramBotUserId: string }): Promise<BotBillingEntitlements> {
    const now = new Date();
    const plans = await this.prisma.botSubscriptionPlan.findMany({
      // Plan activation controls the sale catalog. It must not revoke an
      // already-paid subscriber's capabilities or the bot's free core.
      where: { botIntegrationId: input.botIntegrationId },
      select: { id: true, freeCapabilities: true, paidCapabilities: true },
    });
    const subscriptions = await this.prisma.botSubscription.findMany({
      where: {
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        // A cancellation changes the provider status before the already-paid
        // period ends. Access must follow the effective period, not just the
        // provider status label.
        status: { in: [BotSubscriptionStatus.ACTIVE, BotSubscriptionStatus.CANCELED] },
        OR: [
          {
            source: { in: ['STRIPE', 'TELEGRAM_STARS'] },
            currentPeriodEnd: { gt: now },
            // Test provider events must never create a live Finance
            // entitlement. Manual and gift grants deliberately have no
            // provider environment and are managed by their own expiry.
            providerSubscription: { mode: BotBillingProviderMode.LIVE },
          },
          { source: { in: ['MANUAL', 'GIFT'] }, grants: { some: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
        ],
      },
      select: { planId: true, currentPeriodEnd: true, grants: { where: { revokedAt: null }, select: { expiresAt: true } } },
    });
    const paidPlanIds = new Set(subscriptions.map((item) => item.planId).filter(Boolean));
    const capabilities = new Set(plans.flatMap((plan) => [
      ...plan.freeCapabilities,
      ...(paidPlanIds.has(plan.id) ? plan.paidCapabilities : []),
    ]));
    const expirations = subscriptions.flatMap((subscription) => [
      subscription.currentPeriodEnd,
      ...subscription.grants.map((grant) => grant.expiresAt),
    ]).filter((value): value is Date => value instanceof Date);
    return {
      botIntegrationId: input.botIntegrationId,
      telegramBotUserId: input.telegramBotUserId,
      capabilities: [...capabilities].sort(),
      hasPaidEntitlement: paidPlanIds.size > 0,
      activeUntil: expirations.length ? new Date(Math.max(...expirations.map(Number))).toISOString() : null,
    };
  }
}
