import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { BotBillingProviderMode, BotSubscriptionStatus, FinanceAiProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { BotEntitlementsService } from '../../bot-billing/bot-entitlements.service';

/**
 * The Finance vocabulary stays here while subscription state stays in the
 * reusable billing resolver. Premium handlers should ask this service for a
 * capability instead of interpreting provider statuses themselves.
 */
export const FINANCE_TIERS = ['FREE', 'PRO', 'ULTIMATE'] as const;
export type FinanceTier = (typeof FINANCE_TIERS)[number];
export const FINANCE_CAPABILITIES = ['AI_INPUT', 'VOICE_INPUT', 'INTELLIGENT_CATEGORIZATION', 'RECEIPT_SCAN', 'SMART_LIMITS', 'FINANCE_HISTORY_QA', 'DEEP_ANALYTICS', 'ITEM_ANALYTICS', 'MERCHANT_PATTERNS', 'AUTOMATIC_INSIGHTS', 'ANOMALY_DETECTION', 'FINANCIAL_FORECAST'] as const;
export type FinanceCapability = (typeof FINANCE_CAPABILITIES)[number];
export type FinanceUsageFeature = 'AI_INPUT' | 'RECEIPT_SCAN';

export const FINANCE_PRODUCT_DEFINITIONS: Record<FinanceTier, { price: { amountMinor: number; currency: 'UAH'; interval: 'MONTH' } | null; capabilities: readonly FinanceCapability[] }> = {
  FREE: { price: null, capabilities: [] },
  PRO: { price: { amountMinor: 14900, currency: 'UAH', interval: 'MONTH' }, capabilities: ['AI_INPUT', 'VOICE_INPUT', 'INTELLIGENT_CATEGORIZATION', 'RECEIPT_SCAN', 'SMART_LIMITS'] },
  ULTIMATE: { price: { amountMinor: 24900, currency: 'UAH', interval: 'MONTH' }, capabilities: ['AI_INPUT', 'VOICE_INPUT', 'INTELLIGENT_CATEGORIZATION', 'RECEIPT_SCAN', 'SMART_LIMITS', 'FINANCE_HISTORY_QA', 'DEEP_ANALYTICS', 'ITEM_ANALYTICS', 'MERCHANT_PATTERNS', 'AUTOMATIC_INSIGHTS', 'ANOMALY_DETECTION', 'FINANCIAL_FORECAST'] },
};

@Injectable()
export class FinanceEntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingEntitlements?: BotEntitlementsService,
  ) {}

  async resolve(input: { botIntegrationId: string; telegramBotUserId: string; profileId?: string }) {
    const now = new Date();
    const subscriptions = await this.prisma.botSubscription.findMany({
      where: {
        botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId,
        status: { in: [BotSubscriptionStatus.ACTIVE, BotSubscriptionStatus.CANCELED] },
        plan: { is: { code: { in: ['FREE', 'PRO', 'ULTIMATE'], mode: 'insensitive' } } },
        OR: [
          { source: { in: ['STRIPE', 'TELEGRAM_STARS'] }, currentPeriodEnd: { gt: now }, providerSubscription: { is: { mode: BotBillingProviderMode.LIVE } } },
          { source: { in: ['MANUAL', 'GIFT'] }, grants: { some: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
        ],
      },
      select: { currentPeriodEnd: true, cancelAtPeriodEnd: true, plan: { select: { code: true } }, grants: { where: { revokedAt: null }, select: { expiresAt: true } } },
    });
    let tier = subscriptions.reduce<FinanceTier>((current, subscription) => {
      const code = subscription.plan?.code.toUpperCase() as FinanceTier | undefined;
      return code === 'ULTIMATE' || (code === 'PRO' && current === 'FREE') ? code : current;
    }, 'FREE');
    // Existing generic billing plans remain valid while operators migrate to
    // the canonical Finance codes. Only recognised Finance capabilities opt a
    // legacy paid plan into the Finance compatibility tier.
    const legacy = tier === 'FREE' && this.billingEntitlements
      ? await this.billingEntitlements.resolve(input)
      : null;
    if (
      legacy?.hasPaidEntitlement &&
      legacy.capabilities.some((capability) =>
        (FINANCE_CAPABILITIES as readonly string[]).includes(capability),
      )
    )
      tier = 'PRO';
    const dates = subscriptions.flatMap((s) => [s.currentPeriodEnd, ...s.grants.map((g) => g.expiresAt)]).filter((d): d is Date => d instanceof Date);
    const profileId = input.profileId || (await this.prisma.financeProfile.findUnique({ where: { botIntegrationId_telegramBotUserId: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId } }, select: { id: true } }))?.id;
    const usage = profileId ? await Promise.all((['AI_INPUT', 'RECEIPT_SCAN'] as const).map((feature) => this.usage(profileId, tier, feature))) : [];
    return { tier, capabilities: [...FINANCE_PRODUCT_DEFINITIONS[tier].capabilities], activeUntil: dates.length ? new Date(Math.max(...dates.map(Number))).toISOString() : legacy?.activeUntil || null, cancelAtPeriodEnd: subscriptions.some((s) => s.cancelAtPeriodEnd), usage };
  }

  async has(
    input: { botIntegrationId: string; telegramBotUserId: string; profileId?: string },
    entitlement: FinanceCapability,
  ) {
    const resolved = await this.resolve(input);
    return resolved.capabilities.includes(entitlement) || ((entitlement === 'AI_INPUT' || entitlement === 'RECEIPT_SCAN') && resolved.usage.some((item) => item.feature === entitlement && item.remaining !== 0));
  }

  async assertCanUse(input: { botIntegrationId: string; telegramBotUserId: string; profileId: string }, feature: FinanceUsageFeature) {
    const resolved = await this.resolve(input);
    const usage = resolved.usage.find((item) => item.feature === feature);
    if (!usage || usage.remaining === 0) throw new HttpException('Finance usage limit reached', HttpStatus.TOO_MANY_REQUESTS);
    return usage;
  }

  /**
   * A short-lived reservation serializes the last available request without
   * charging failures: it becomes SUCCEEDED only after the provider returns.
   * Stale reservations expire from admission after five minutes, so a process
   * crash cannot permanently consume an allowance.
   */
  async reserve(input: { botIntegrationId: string; telegramBotUserId: string; profileId: string }, feature: FinanceUsageFeature, model: string) {
    const resolved = await this.resolve(input);
    const limit = this.limit(resolved.tier, feature);
    if (limit === null) return null;
    const now = new Date();
    const periodStart = resolved.tier === 'FREE' ? undefined : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const pendingAfter = new Date(now.getTime() - 5 * 60_000);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.profileId}:${feature}`}))`);
      const reserved = await tx.aiUsageEvent.count({
        where: {
          profileId: input.profileId,
          feature,
          OR: [
            { status: 'SUCCEEDED', ...(periodStart ? { createdAt: { gte: periodStart } } : {}) },
            { status: 'PENDING', createdAt: { gte: pendingAfter } },
          ],
        },
      });
      if (reserved >= limit) throw new HttpException('Finance usage limit reached', HttpStatus.TOO_MANY_REQUESTS);
      return tx.aiUsageEvent.create({ data: { profileId: input.profileId, botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId, feature, provider: FinanceAiProvider.OPENAI, model, latencyMs: 0, status: 'PENDING' }, select: { id: true } });
    });
  }

  private async usage(profileId: string, tier: FinanceTier, feature: FinanceUsageFeature) {
    const limit = this.limit(tier, feature);
    const monthly = limit !== null && tier !== 'FREE';
    const now = new Date();
    const start = monthly ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) : undefined;
    const used = await this.prisma.aiUsageEvent.count({ where: { profileId, feature, status: 'SUCCEEDED', ...(start ? { createdAt: { gte: start } } : {}) } });
    return { feature, used, limit, remaining: limit === null ? null : Math.max(0, limit - used), resetAt: monthly ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString() : null };
  }

  private limit(tier: FinanceTier, feature: FinanceUsageFeature) {
    return feature === 'AI_INPUT' ? (tier === 'FREE' ? 10 : null) : tier === 'FREE' ? 3 : tier === 'PRO' ? 30 : 200;
  }
}
