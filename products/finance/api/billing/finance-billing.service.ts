import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  NotFoundException,
} from "@nestjs/common";
import type { ConsumerBillingCatalog } from "@telegram-system/shared";
import { isProductionEnvironment } from "@api/config/deployment-config";
import { PrismaService } from "@api/prisma/prisma.service";
import { BotBillingService } from "@api/domains/telegram/bot-billing/bot-billing.service";
import { FinanceEntitlementService } from "@consumer-finance/api/billing/finance-entitlement.service";
import {
  FINANCE_PRODUCT_DEFINITIONS,
  FINANCE_TIERS,
  type FinanceTier,
} from "@consumer-finance/api/billing/finance-product-definition";

@Injectable()
export class FinanceBillingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FinanceBillingService.name);
  private refreshQueue = Promise.resolve();

  onApplicationBootstrap() {
    this.billing.registerCatalogRefresh((botId, workspaceId) =>
      this.refreshCatalog(botId, workspaceId),
    );
    void this.refreshCatalog();
  }

  private refreshCatalog(botId?: string, workspaceId?: string) {
    this.refreshQueue = this.refreshQueue
      .then(async () => {
        const bots = await this.prisma.telegramBotIntegration.findMany({
          where: { applicationType: "FINANCE", id: botId, workspaceId },
          select: { id: true, workspaceId: true },
        });
        for (const bot of bots) {
          await this.billing.reconcileFixedCatalog(
            bot,
            "FINANCE",
            this.definitions(),
          );
        }
      })
      .catch(() =>
        this.logger.warn("Could not prepare Finance billing catalog"),
      );
    return this.refreshQueue;
  }

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
    const [catalog, current, paymentEvents, usedIntro] = await Promise.all([
      this.billing.catalog(input.botIntegrationId, input.telegramBotUserId),
      this.entitlements.resolveForBilling(input),
      this.prisma.botBillingEvent.findMany({
        where: {
          botIntegrationId: input.botIntegrationId,
          subscription: { telegramBotUserId: input.telegramBotUserId },
          OR: [
            { type: { in: ["PAYMENT_SUCCEEDED", "PAYMENT_FAILED"] } },
            {
              type: "GRANT_CREATED",
              subscription: { source: { in: ["GIFT", "MANUAL"] } },
            },
          ],
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
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
      this.prisma.botSubscription.findFirst({
        where: {
          botIntegrationId: input.botIntegrationId,
          telegramBotUserId: input.telegramBotUserId,
          introPaidAt: { not: null },
        },
        select: { id: true },
      }),
    ]);
    const { activeSubscriptions, ...entitlements } = current;
    const mode = isProductionEnvironment() ? "LIVE" : "TEST";
    const grants = activeSubscriptions.flatMap(
      (subscription) => subscription.grants,
    );
    const gift = grants.length
      ? {
          expiresAt: grants.some((grant) => grant.expiresAt === null)
            ? null
            : new Date(
                Math.max(...grants.map((grant) => Number(grant.expiresAt))),
              ).toISOString(),
        }
      : null;
    const paid = activeSubscriptions
      .filter(
        (subscription) =>
          subscription.source === "STRIPE" &&
          subscription.providerSubscription &&
          subscription.currentPeriodEnd,
      )
      .sort(
        (a, b) =>
          Number(b.providerSubscription?.mode === mode) -
            Number(a.providerSubscription?.mode === mode) ||
          Number(b.currentPeriodEnd) - Number(a.currentPeriodEnd),
      )[0];
    const provider = paid?.providerSubscription;
    const canManage = provider?.mode === mode;
    const renewal =
      paid &&
      provider &&
      canManage &&
      !paid.cancelAtPeriodEnd &&
      paid.status === "ACTIVE"
        ? await this.billing
            .stripeRenewal({
              botIntegrationId: input.botIntegrationId,
              mode: provider.mode,
              providerSubscriptionId: provider.providerSubscriptionId,
            })
            .catch(() => null)
        : null;
    const stripe = paid?.currentPeriodEnd
      ? {
          id: paid.id,
          currentPeriodEnd: paid.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: paid.cancelAtPeriodEnd || paid.status !== "ACTIVE",
          canManageRenewal: canManage && paid.status === "ACTIVE",
          canChangePlan:
            canManage &&
            paid.status === "ACTIVE" &&
            !paid.cancelAtPeriodEnd &&
            provider?.providerStatus !== "trialing" &&
            paid.plan?.code.toUpperCase() === "PRO",
          interval:
            provider?.providerStatus === "trialing"
              ? "DAY"
              : (renewal?.interval ?? paid.interval),
          intervalCount:
            provider?.providerStatus === "trialing"
              ? paid.intervalCount
              : (renewal?.intervalCount ?? paid.intervalCount),
          renewal,
        }
      : null;
    const persisted = new Map(
      catalog.plans.map((plan) => [plan.code.toUpperCase(), plan]),
    );
    const hasRecoverablePaidSubscription = catalog.subscriptions.some(
      (subscription) =>
        ["STRIPE", "TELEGRAM_STARS"].includes(subscription.source) &&
        subscription.status === "PAST_DUE",
    );
    const plans = FINANCE_TIERS.map((tier) => {
      const definition = FINANCE_PRODUCT_DEFINITIONS[tier];
      const plan = persisted.get(tier);
      const prices = (plan?.prices || []).filter((price) =>
        this.isCanonicalPrice(tier, {
          currency: price.currency,
          interval: price.interval,
          intervalCount: price.intervalCount,
          amountMinor: price.amountMinor,
        }),
      );
      return {
        id: plan?.id || null,
        code: tier,
        capabilities: [...definition.capabilities],
        features: [...definition.features],
        usageLimits: { ...definition.usageLimits },
        usagePeriods: { ...definition.usagePeriods },
        canPurchase:
          prices.length > 0 &&
          canStartFinanceCheckout(
            current.tier,
            tier,
            hasRecoverablePaidSubscription,
          ),
        prices: [
          ...deduplicatePrices(prices).map((price) => ({
            id: price.id,
            currency: price.currency,
            interval: price.interval,
            intervalCount: price.intervalCount,
            amountMinor: price.amountMinor,
            version: price.version,
            available: price.interval !== "DAY" || !usedIntro,
          })),
          ...(definition.prices ?? [])
            .filter(
              (offer) =>
                !prices.some(
                  (price) =>
                    price.currency === offer.currency &&
                    price.interval === offer.interval &&
                    price.intervalCount === offer.intervalCount,
                ),
            )
            .map((offer) => ({
              ...offer,
              id: `pending-${offer.interval}-${offer.intervalCount}`,
              version: 0,
              available: false,
            })),
        ],
      };
    });
    return {
      ...catalog,
      providers: catalog.providers.filter(
        (provider) => provider.provider !== "STRIPE" || provider.mode === mode,
      ),
      current: entitlements,
      activeAccess: { gift, stripe },
      plans,
      subscriptions: catalog.subscriptions.map((subscription) => ({
        ...subscription,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() || null,
      })),
      paymentHistory: paymentEvents.map((event) => ({
        id: event.id,
        status:
          event.type === "GRANT_CREATED"
            ? "GIFTED"
            : event.type === "PAYMENT_SUCCEEDED"
              ? "SUCCEEDED"
              : "FAILED",
        provider: event.provider,
        amountMinor: event.amountMinor,
        currency: event.currency,
        occurredAt: event.occurredAt.toISOString(),
        planCode: event.subscription?.plan?.code || null,
      })),
    };
  }

  async createStripeCheckout(
    input: Parameters<BotBillingService["createStripeCheckout"]>[0],
  ) {
    await this.assertCanonicalPrice(
      input.botIntegrationId,
      input.telegramBotUserId,
      input.priceId,
      "STRIPE",
    );
    return this.billing.createStripeCheckout({
      ...input,
      preventOverlap: true,
    });
  }

  async createStarsCheckout(
    input: Parameters<BotBillingService["createStarsCheckout"]>[0],
  ) {
    await this.assertCanonicalPrice(
      input.botIntegrationId,
      input.telegramBotUserId,
      input.priceId,
      "TELEGRAM_STARS",
    );
    return this.billing.createStarsCheckout(input);
  }

  async setStripeAutoRenewal(
    input: Parameters<BotBillingService["setStripeAutoRenewal"]>[0],
  ) {
    const subscription = await this.billing.setStripeAutoRenewal(input);
    return {
      id: subscription.id,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() || null,
    };
  }

  stripePortal(input: Parameters<BotBillingService["stripePortal"]>[0]) {
    return this.billing.stripePortal(input);
  }

  async changeStripePlan(
    input: Parameters<BotBillingService["changeStripePlan"]>[0],
  ) {
    const price = await this.prisma.botPlanPrice.findFirst({
      where: {
        id: input.priceId,
        isActive: true,
        isPublic: true,
        currency: "UAH",
        interval: { in: ["MONTH", "YEAR"] },
        plan: {
          botIntegrationId: input.botIntegrationId,
          code: "PRO",
          isActive: true,
        },
      },
      select: {
        currency: true,
        interval: true,
        intervalCount: true,
        amountMinor: true,
      },
    });
    if (
      !price ||
      !["MONTH", "YEAR"].includes(price.interval) ||
      !this.isCanonicalPrice("PRO", price)
    )
      throw new BadRequestException("Choose a recurring Groshly Plus plan");
    return this.billing.changeStripePlan(input);
  }

  syncCatalog(userId: string, botIntegrationId: string) {
    return this.billing.syncFixedCatalog(
      userId,
      botIntegrationId,
      "FINANCE",
      this.definitions(),
    );
  }

  private definitions() {
    return FINANCE_TIERS.flatMap((tier) => {
      const definition = FINANCE_PRODUCT_DEFINITIONS[tier];
      return (definition.prices ?? []).map((price) => ({
        code: tier,
        name: definition.name,
        ...price,
      }));
    });
  }

  syncCoupon(userId: string, botIntegrationId: string, couponId: string) {
    return this.billing.syncCouponToStripe(userId, botIntegrationId, couponId);
  }

  private async assertCanonicalPrice(
    botIntegrationId: string,
    telegramBotUserId: string,
    priceId: string,
    provider: "STRIPE" | "TELEGRAM_STARS",
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
        intervalCount: true,
        amountMinor: true,
        plan: { select: { code: true } },
      },
    });
    if (!price) throw new NotFoundException("Public Finance price not found");
    const tier = price.plan.code.toUpperCase() as FinanceTier;
    const validProviderCurrency =
      provider === "STRIPE"
        ? price.currency === "UAH"
        : price.currency === "XTR";
    if (!validProviderCurrency || !this.isCanonicalPrice(tier, price)) {
      throw new BadRequestException(
        "Finance checkout requires a canonical plan price",
      );
    }
    const [current, recoverable] = await Promise.all([
      this.entitlements.resolve({ botIntegrationId, telegramBotUserId }),
      this.prisma.botSubscription.findFirst({
        where: {
          botIntegrationId,
          telegramBotUserId,
          source: { in: ["STRIPE", "TELEGRAM_STARS"] },
          status: "PAST_DUE",
        },
        select: { id: true },
      }),
    ]);
    if (!canStartFinanceCheckout(current.tier, tier, Boolean(recoverable))) {
      throw new BadRequestException(
        "Finance checkout requires no active paid plan; manage the current subscription first",
      );
    }
  }

  private isCanonicalPrice(
    tier: FinanceTier,
    price: {
      currency: string;
      interval: string;
      intervalCount: number;
      amountMinor: number;
    },
  ) {
    const definition = FINANCE_PRODUCT_DEFINITIONS[tier];
    const canonicalPrices =
      definition?.prices || (definition?.price ? [definition.price] : []);
    if (price.currency === "XTR") return price.interval === "MONTH";
    return canonicalPrices.some(
      (canonical) =>
        canonical.currency === price.currency &&
        canonical.interval === price.interval &&
        canonical.intervalCount === price.intervalCount &&
        canonical.amountMinor === price.amountMinor,
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
    current === "FREE" &&
    !hasRecoverablePaidSubscription &&
    financeTierRank(target) > 0
  );
}

function deduplicatePrices<T extends { currency: string; interval: string }>(
  prices: T[],
) {
  const seen = new Set<string>();
  return prices.filter((price) => {
    const key = `${price.currency}:${price.interval}:${"intervalCount" in price ? price.intervalCount : 1}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
