import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BotBillingProvider,
  BotBillingProviderMode,
  BotSubscriptionSource,
  BotSubscriptionStatus,
  Prisma,
  TelegramBotRuntimeEnvironment,
} from '@prisma/client';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { StripeBillingProvider } from './stripe-billing.provider';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import {
  isProductionEnvironment,
  telegramBotRuntimeEnvironmentName,
} from '../../../config/deployment-config';

type Mode = 'TEST' | 'LIVE';

export class BotBillingCheckout {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly stripe: StripeBillingProvider,
    private readonly botApi: TelegramBotApiClient,
    private readonly bot: (
      userId: string,
      botIntegrationId: string,
    ) => Promise<{ id: string; workspaceId: string }>,
  ) {}

  async createStripeCheckout(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    priceId: string;
    requestedMode?: Mode;
    couponCode?: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const mode = isProductionEnvironment()
      ? BotBillingProviderMode.LIVE
      : input.requestedMode || BotBillingProviderMode.LIVE;
    const price = await this.prisma.botPlanPrice.findFirst({
      where: {
        id: input.priceId,
        isActive: true,
        isPublic: true,
        plan: { botIntegrationId: input.botIntegrationId, isActive: true },
      },
      include: { plan: true },
    });
    if (!price) throw new NotFoundException('Public billing price not found');
    const subscriber = await this.prisma.telegramBotUser.findFirst({
      where: {
        id: input.telegramBotUserId,
        botIntegrationId: input.botIntegrationId,
      },
      select: { id: true, workspaceId: true },
    });
    if (!subscriber || subscriber.workspaceId !== price.plan.workspaceId)
      throw new NotFoundException('Billing subscriber not found');
    const coupon = input.couponCode
      ? await this.validCoupon({
          botIntegrationId: input.botIntegrationId,
          telegramBotUserId: subscriber.id,
          planId: price.planId,
          priceId: price.id,
          currency: price.currency,
          code: input.couponCode,
        })
      : null;
    const stripeConfigId = await this.stripe.configId(
      input.botIntegrationId,
      mode,
    );
    const syncedPriceId = this.providerPriceId(
      price.providerPriceIdentity,
      mode,
      stripeConfigId,
    );
    const providerPriceId =
      syncedPriceId ||
      (await this.stripe.ensurePrice({
        botIntegrationId: input.botIntegrationId,
        mode,
        plan: price.plan,
        price,
      }));
    const promotionCodeId = coupon
      ? this.providerPromotionCode(
          coupon.providerCouponIdentity,
          mode,
          stripeConfigId,
        )
      : null;
    if (coupon && !promotionCodeId)
      throw new BadRequestException(
        'Coupon is not synchronized with the selected Stripe mode',
      );
    const customerId = await this.stripe.customer({
      botIntegrationId: input.botIntegrationId,
      workspaceId: subscriber.workspaceId,
      telegramBotUserId: subscriber.id,
      mode,
    });
    const subscription = await this.prisma.botSubscription.create({
      data: {
        workspaceId: subscriber.workspaceId,
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: subscriber.id,
        planId: price.planId,
        planPriceId: price.id,
        source: 'STRIPE',
        status: 'INCOMPLETE',
        currency: price.currency,
        interval: price.interval,
        amountMinor: price.amountMinor,
        priceVersion: price.version,
        providerCustomerId: customerId,
      },
    });
    try {
      const checkout = await this.stripe.checkout({
        botIntegrationId: input.botIntegrationId,
        mode,
        customerId,
        priceId: providerPriceId,
        subscriptionId: subscription.id,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        discount: promotionCodeId ? { code: promotionCodeId } : undefined,
      });
      if (coupon)
        await this.prisma.botCouponRedemption.create({
          data: {
            couponId: coupon.id,
            telegramBotUserId: subscriber.id,
            planPriceId: price.id,
            subscriptionId: subscription.id,
            idempotencyKey: `checkout:${subscription.id}`,
          },
        });
      return { ...checkout, subscriptionId: subscription.id };
    } catch (error) {
      await this.prisma.botSubscription.delete({
        where: { id: subscription.id },
      });
      throw error;
    }
  }

  private providerPriceId(
    value: Prisma.JsonValue | null,
    mode: BotBillingProviderMode,
    configId: string,
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const stripe = (value as Record<string, unknown>).STRIPE;
    const entry =
      stripe && typeof stripe === 'object' && !Array.isArray(stripe)
        ? (stripe as Record<string, unknown>)[mode]
        : null;
    return entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      (entry as Record<string, unknown>).configId === configId &&
      typeof (entry as Record<string, unknown>).priceId === 'string'
      ? (entry as Record<string, string>).priceId
      : null;
  }

  private providerPromotionCode(
    value: Prisma.JsonValue | null,
    mode: BotBillingProviderMode,
    configId?: string,
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const stripe = (value as Record<string, unknown>).STRIPE;
    if (!stripe || typeof stripe !== 'object' || Array.isArray(stripe))
      return null;
    const entry = (stripe as Record<string, unknown>)[mode];
    return entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      (!configId || (entry as Record<string, unknown>).configId === configId) &&
      typeof (entry as Record<string, unknown>).promotionCodeId === 'string'
      ? (entry as Record<string, string>).promotionCodeId
      : null;
  }

  async syncCouponToStripe(
    userId: string,
    botIntegrationId: string,
    couponId: string,
    mode: Mode = 'LIVE',
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    const coupon = await this.prisma.botCoupon.findFirst({
      where: { id: couponId, workspaceId: bot.workspaceId, botIntegrationId },
    });
    if (!coupon) throw new NotFoundException('Billing coupon not found');
    const configId = await this.stripe.configId(botIntegrationId, mode);
    const existing = this.providerPromotionCode(
      coupon.providerCouponIdentity,
      mode,
      configId,
    );
    if (existing) return coupon;
    const identity = await this.stripe.createCoupon({
      botIntegrationId,
      mode: mode,
      couponId: coupon.id,
      code: coupon.code,
      percentOff: coupon.percentOff,
      amountOffMinor: coupon.amountOffMinor,
      currency: coupon.currency,
      maxRedemptions: coupon.maxRedemptions,
      expiresAt: coupon.expiresAt,
    });
    const current =
      coupon.providerCouponIdentity &&
      typeof coupon.providerCouponIdentity === 'object' &&
      !Array.isArray(coupon.providerCouponIdentity)
        ? (coupon.providerCouponIdentity as Record<string, unknown>)
        : {};
    return this.prisma.botCoupon.update({
      where: { id: coupon.id },
      data: {
        providerCouponIdentity: {
          ...current,
          STRIPE: {
            ...((current.STRIPE as Record<string, unknown>) || {}),
            [mode]: identity,
          },
        } as Prisma.InputJsonValue,
      },
    });
  }

  async setStripeAutoRenewal(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    cancelAtPeriodEnd: boolean;
  }) {
    const subscription = await this.prisma.botSubscription.findFirst({
      where: {
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        source: BotSubscriptionSource.STRIPE,
        status: {
          in: [BotSubscriptionStatus.ACTIVE, BotSubscriptionStatus.PAST_DUE],
        },
        providerSubscription: { is: { provider: BotBillingProvider.STRIPE } },
      },
      orderBy: { createdAt: 'desc' },
      include: { providerSubscription: true },
    });
    if (!subscription?.providerSubscription)
      throw new NotFoundException('Active Stripe subscription not found');
    const result = await this.stripe.setCancelAtPeriodEnd({
      botIntegrationId: input.botIntegrationId,
      mode: subscription.providerSubscription.mode,
      providerSubscriptionId:
        subscription.providerSubscription.providerSubscriptionId,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    });
    return this.prisma.botSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        currentPeriodEnd: result.currentPeriodEnd
          ? new Date(result.currentPeriodEnd * 1000)
          : subscription.currentPeriodEnd,
      },
    });
  }

  async stripePortal(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    returnUrl: string;
  }) {
    const customer = await this.prisma.botProviderCustomer.findFirst({
      where: {
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        provider: BotBillingProvider.STRIPE,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!customer) throw new NotFoundException('Stripe customer not found');
    return {
      url: await this.stripe.portal({
        botIntegrationId: input.botIntegrationId,
        mode: customer.mode,
        customerId: customer.providerCustomerId,
        returnUrl: input.returnUrl,
      }),
    };
  }

  private async validCoupon(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    planId: string;
    priceId: string;
    currency: string;
    code: string;
  }) {
    const now = new Date();
    const coupon = await this.prisma.botCoupon.findFirst({
      where: {
        botIntegrationId: input.botIntegrationId,
        code: input.code.trim().toUpperCase(),
        isActive: true,
      },
    });
    if (
      !coupon ||
      (coupon.startsAt && coupon.startsAt > now) ||
      (coupon.expiresAt && coupon.expiresAt <= now) ||
      (coupon.planId && coupon.planId !== input.planId) ||
      (coupon.amountOffMinor && coupon.currency !== input.currency)
    )
      throw new BadRequestException('Coupon is invalid for this price');
    const [uses, existing, paid] = await Promise.all([
      this.prisma.botCouponRedemption.count({ where: { couponId: coupon.id } }),
      this.prisma.botCouponRedemption.findFirst({
        where: {
          couponId: coupon.id,
          telegramBotUserId: input.telegramBotUserId,
          planPriceId: input.priceId,
        },
      }),
      coupon.newUsersOnly
        ? this.prisma.botSubscription.count({
            where: {
              botIntegrationId: input.botIntegrationId,
              telegramBotUserId: input.telegramBotUserId,
              status: { in: ['ACTIVE', 'CANCELED', 'PAST_DUE'] },
            },
          })
        : Promise.resolve(0),
    ]);
    if (
      existing ||
      (coupon.maxRedemptions && uses >= coupon.maxRedemptions) ||
      paid
    )
      throw new BadRequestException('Coupon redemption is not eligible');
    return coupon;
  }

  async createStarsCheckout(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    priceId: string;
  }) {
    const price = await this.prisma.botPlanPrice.findFirst({
      where: {
        id: input.priceId,
        currency: 'XTR',
        interval: 'MONTH',
        isActive: true,
        isPublic: true,
        plan: { botIntegrationId: input.botIntegrationId, isActive: true },
      },
      include: { plan: true },
    });
    if (!price || price.amountMinor > 10000)
      throw new NotFoundException('Public monthly Stars price not found');
    const starConfigs = await this.prisma.botBillingProviderConfig.findMany({
      where: {
        workspaceId: price.plan.workspaceId,
        provider: 'TELEGRAM_STARS',
        mode: 'LIVE',
        connectionStatus: 'CONNECTED',
        OR: [
          { botIntegrationId: input.botIntegrationId },
          { botIntegrationId: null },
        ],
      },
    });
    const config =
      starConfigs.find(
        (item) => item.botIntegrationId === input.botIntegrationId,
      ) || starConfigs.find((item) => item.botIntegrationId === null);
    if (!config) throw new BadRequestException('Telegram Stars is not enabled');
    const configuredEnvironment = telegramBotRuntimeEnvironmentName();
    const environment =
      configuredEnvironment === 'LOCAL'
        ? TelegramBotRuntimeEnvironment.LOCAL
        : configuredEnvironment === 'PRODUCTION' || isProductionEnvironment()
          ? TelegramBotRuntimeEnvironment.PRODUCTION
          : null;
    const bot = environment
      ? await this.prisma.telegramBotRuntimeInstance.findFirst({
          where: {
            botIntegrationId: input.botIntegrationId,
            workspaceId: price.plan.workspaceId,
            environment,
            runtimeStatus: 'ACTIVE',
          },
          select: {
            botTokenEncrypted: true,
            botTokenIv: true,
            botTokenAuthTag: true,
          },
        })
      : null;
    const subscriber = await this.prisma.telegramBotUser.findFirst({
      where: {
        id: input.telegramBotUserId,
        botIntegrationId: input.botIntegrationId,
        workspaceId: price.plan.workspaceId,
      },
    });
    if (!bot || !subscriber)
      throw new NotFoundException('Billing subscriber not found');
    const subscription = await this.prisma.botSubscription.create({
      data: {
        workspaceId: price.plan.workspaceId,
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: subscriber.id,
        planId: price.planId,
        planPriceId: price.id,
        source: 'TELEGRAM_STARS',
        status: 'INCOMPLETE',
        currency: 'XTR',
        interval: 'MONTH',
        amountMinor: price.amountMinor,
        priceVersion: price.version,
      },
    });
    const token = this.encryption.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
    try {
      const url = await this.botApi.createInvoiceLink(token, {
        title: price.plan.name.slice(0, 32),
        description: (
          price.plan.description || 'Finance Pro monthly subscription'
        ).slice(0, 255),
        payload: `fin_sub:${subscription.id}`,
        currency: 'XTR',
        prices: [{ label: price.plan.name, amount: price.amountMinor }],
        subscription_period: 2592000,
      });
      return { subscriptionId: subscription.id, url };
    } catch (error) {
      await this.prisma.botSubscription.delete({
        where: { id: subscription.id },
      });
      throw error;
    }
  }

  async validateStarsPreCheckout(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    payload?: string;
    currency?: string;
    totalAmount?: number;
  }) {
    const id = input.payload?.startsWith('fin_sub:')
      ? input.payload.slice(8)
      : '';
    const subscription = id
      ? await this.prisma.botSubscription.findFirst({
          where: {
            id,
            botIntegrationId: input.botIntegrationId,
            telegramBotUserId: input.telegramBotUserId,
            source: 'TELEGRAM_STARS',
            status: 'INCOMPLETE',
          },
        })
      : null;
    return Boolean(
      subscription &&
      input.currency === 'XTR' &&
      subscription.amountMinor === input.totalAmount,
    );
  }

  async processStarsPayment(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    payment: {
      invoice_payload?: string;
      currency?: string;
      total_amount?: number;
      telegram_payment_charge_id?: string;
      subscription_expiration_date?: number;
    };
  }) {
    const id = input.payment.invoice_payload?.startsWith('fin_sub:')
      ? input.payment.invoice_payload.slice(8)
      : '';
    const chargeId = input.payment.telegram_payment_charge_id;
    if (!id || !chargeId || input.payment.currency !== 'XTR')
      throw new BadRequestException('Invalid Telegram Stars payment');
    const subscription = await this.prisma.botSubscription.findFirst({
      where: {
        id,
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        source: 'TELEGRAM_STARS',
        amountMinor: input.payment.total_amount,
      },
    });
    if (!subscription)
      throw new BadRequestException(
        'Telegram Stars payment does not match a subscription',
      );
    const duplicate = await this.prisma.botBillingEvent.findFirst({
      where: {
        provider: 'TELEGRAM_STARS',
        mode: 'LIVE',
        providerEventId: chargeId,
      },
    });
    if (duplicate) return { activated: true, duplicate: true };
    const end = input.payment.subscription_expiration_date
      ? new Date(input.payment.subscription_expiration_date * 1000)
      : new Date(Date.now() + 2592000 * 1000);
    await this.prisma.$transaction(async (tx) => {
      await tx.botSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          providerSubscriptionId: chargeId,
          currentPeriodStart: new Date(),
          currentPeriodEnd: end,
        },
      });
      await tx.botProviderSubscription.upsert({
        where: { subscriptionId: subscription.id },
        update: { providerStatus: 'ACTIVE', lastSyncedAt: new Date() },
        create: {
          subscriptionId: subscription.id,
          provider: 'TELEGRAM_STARS',
          mode: 'LIVE',
          providerSubscriptionId: chargeId,
          providerStatus: 'ACTIVE',
        },
      });
      await tx.botBillingEvent.create({
        data: {
          workspaceId: subscription.workspaceId,
          botIntegrationId: subscription.botIntegrationId,
          subscriptionId: subscription.id,
          provider: 'TELEGRAM_STARS',
          mode: 'LIVE',
          providerEventId: chargeId,
          type: 'PAYMENT_SUCCEEDED',
          amountMinor: input.payment.total_amount,
          currency: 'XTR',
        },
      });
    });
    return { activated: true, duplicate: false };
  }
}
