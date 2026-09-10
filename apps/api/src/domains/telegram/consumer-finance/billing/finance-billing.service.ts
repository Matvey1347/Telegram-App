import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConsumerBillingCatalog } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { BotBillingService } from '../../bot-billing/bot-billing.service';
import { FinanceEntitlementService } from './finance-entitlement.service';
import {
  FINANCE_PRODUCT_DEFINITIONS,
  FINANCE_TIERS,
  type FinanceTier,
} from './finance-product-definition';

@Injectable()
export class FinanceBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BotBillingService,
    private readonly entitlements: FinanceEntitlementService,
  ) {}

  async catalog(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    profileId: string;
  }): Promise<ConsumerBillingCatalog> {
    const [catalog, current, paymentEvents] = await Promise.all([
      this.billing.catalog(input.botIntegrationId, input.telegramBotUserId),
      this.entitlements.resolve(input),
      this.prisma.botBillingEvent.findMany({
        where: {
          botIntegrationId: input.botIntegrationId,
          type: { in: ['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED'] },
          subscription: { telegramBotUserId: input.telegramBotUserId },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select: {
          id: true,
          type: true,
          provider: true,
          amountMinor: true,
          currency: true,
          occurredAt: true,
          subscription: { select: { plan: { select: { code: true } } } },
        },
      }),
    ]);
    const persisted = new Map(
      catalog.plans.map((plan) => [plan.code.toUpperCase(), plan]),
    );
    const hasRecoverablePaidSubscription = catalog.subscriptions.some(
      (subscription) =>
        ['STRIPE', 'TELEGRAM_STARS'].includes(subscription.source) &&
        subscription.status === 'PAST_DUE',
    );
    const plans = FINANCE_TIERS.map((tier) => {
      const definition = FINANCE_PRODUCT_DEFINITIONS[tier];
      const plan = persisted.get(tier);
      const prices = (plan?.prices || []).filter((price) =>
        this.isCanonicalPrice(tier, {
          currency: price.currency,
          interval: price.interval,
          amountMinor: price.amountMinor,
        }),
      );
      return {
        id: plan?.id || null,
        code: tier,
        capabilities: [...definition.capabilities],
        features: [...definition.features],
        usageLimits: { ...definition.usageLimits },
        canPurchase: canStartFinanceCheckout(
          current.tier,
          tier,
          hasRecoverablePaidSubscription,
        ),
        prices: deduplicatePrices(prices).map((price) => ({
          id: price.id,
          currency: price.currency,
          interval: price.interval,
          amountMinor: price.amountMinor,
          version: price.version,
        })),
      };
    });
    return {
      ...catalog,
      current,
      plans,
      subscriptions: catalog.subscriptions.map((subscription) => ({
        ...subscription,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() || null,
      })),
      paymentHistory: paymentEvents.map((event) => ({
        id: event.id,
        status: event.type === 'PAYMENT_SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
        provider: event.provider,
        amountMinor: event.amountMinor,
        currency: event.currency,
        occurredAt: event.occurredAt.toISOString(),
        planCode: event.subscription?.plan?.code || null,
      })),
    };
  }

  async createStripeCheckout(
    input: Parameters<BotBillingService['createStripeCheckout']>[0],
  ) {
    await this.assertCanonicalPrice(
      input.botIntegrationId,
      input.telegramBotUserId,
      input.priceId,
      'STRIPE',
    );
    return this.billing.createStripeCheckout(input);
  }

  async createStarsCheckout(
    input: Parameters<BotBillingService['createStarsCheckout']>[0],
  ) {
    await this.assertCanonicalPrice(
      input.botIntegrationId,
      input.telegramBotUserId,
      input.priceId,
      'TELEGRAM_STARS',
    );
    return this.billing.createStarsCheckout(input);
  }

  async setStripeAutoRenewal(
    input: Parameters<BotBillingService['setStripeAutoRenewal']>[0],
  ) {
    const subscription = await this.billing.setStripeAutoRenewal(input);
    return {
      id: subscription.id,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() || null,
    };
  }

  stripePortal(input: Parameters<BotBillingService['stripePortal']>[0]) {
    return this.billing.stripePortal(input);
  }

  syncCatalog(userId: string, botIntegrationId: string) {
    return this.billing.syncFixedCatalog(
      userId,
      botIntegrationId,
      'FINANCE',
      FINANCE_TIERS.flatMap((tier) => {
        const definition = FINANCE_PRODUCT_DEFINITIONS[tier];
        return definition.price
          ? [{ code: tier, name: definition.name, ...definition.price }]
          : [];
      }),
    );
  }

  syncCoupon(userId: string, botIntegrationId: string, couponId: string) {
    return this.billing.syncCouponToStripe(userId, botIntegrationId, couponId);
  }

  private async assertCanonicalPrice(
    botIntegrationId: string,
    telegramBotUserId: string,
    priceId: string,
    provider: 'STRIPE' | 'TELEGRAM_STARS',
  ) {
    const price = await this.prisma.botPlanPrice.findFirst({
      where: {
        id: priceId,
        isActive: true,
        isPublic: true,
        plan: { botIntegrationId, isActive: true },
      },
      select: {
        currency: true,
        interval: true,
        amountMinor: true,
        plan: { select: { code: true } },
      },
    });
    if (!price) throw new NotFoundException('Public Finance price not found');
    const tier = price.plan.code.toUpperCase() as FinanceTier;
    const validProviderCurrency =
      provider === 'STRIPE'
        ? price.currency === 'UAH'
        : price.currency === 'XTR';
    if (!validProviderCurrency || !this.isCanonicalPrice(tier, price)) {
      throw new BadRequestException(
        'Finance checkout requires a canonical plan price',
      );
    }
    const [current, recoverable] = await Promise.all([
      this.entitlements.resolve({ botIntegrationId, telegramBotUserId }),
      this.prisma.botSubscription.findFirst({
        where: {
          botIntegrationId,
          telegramBotUserId,
          source: { in: ['STRIPE', 'TELEGRAM_STARS'] },
          status: 'PAST_DUE',
        },
        select: { id: true },
      }),
    ]);
    if (!canStartFinanceCheckout(current.tier, tier, Boolean(recoverable))) {
      throw new BadRequestException(
        'Finance checkout requires no active paid plan; manage the current subscription first',
      );
    }
  }

  private isCanonicalPrice(
    tier: FinanceTier,
    price: { currency: string; interval: string; amountMinor: number },
  ) {
    const definition = FINANCE_PRODUCT_DEFINITIONS[tier];
    if (!definition?.price) return false;
    if (price.currency === 'XTR') return price.interval === 'MONTH';
    return (
      price.currency === definition.price.currency &&
      price.interval === definition.price.interval &&
      price.amountMinor === definition.price.amountMinor
    );
  }
}

function financeTierRank(tier: FinanceTier) {
  return FINANCE_TIERS.indexOf(tier);
}

function canStartFinanceCheckout(
  current: FinanceTier,
  target: FinanceTier,
  hasRecoverablePaidSubscription = false,
) {
  // Generic provider checkout creates a new subscription. Until a dedicated
  // provider-safe replacement/proration flow exists, starting another paid
  // subscription would risk overlapping renewals and double charging.
  return (
    current === 'FREE' &&
    !hasRecoverablePaidSubscription &&
    financeTierRank(target) > 0
  );
}

function deduplicatePrices<T extends { currency: string; interval: string }>(
  prices: T[],
) {
  const seen = new Set<string>();
  return prices.filter((price) => {
    const key = `${price.currency}:${price.interval}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
