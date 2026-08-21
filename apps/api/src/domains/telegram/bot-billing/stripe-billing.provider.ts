import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BotBillingConnectionStatus, BotBillingProvider, BotBillingProviderMode, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class StripeBillingProvider {
  constructor(private readonly prisma: PrismaService, private readonly encryption: TokenEncryptionService) {}

  async resolvedConfig(botIntegrationId: string, mode: BotBillingProviderMode) {
    const bot = await this.prisma.telegramBotIntegration.findUnique({ where: { id: botIntegrationId }, select: { id: true, workspaceId: true } });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const rows = await this.prisma.botBillingProviderConfig.findMany({ where: { workspaceId: bot.workspaceId, provider: BotBillingProvider.STRIPE, mode, OR: [{ botIntegrationId }, { botIntegrationId: null }] } });
    const config = rows.find((row) => row.botIntegrationId === botIntegrationId) || rows.find((row) => row.botIntegrationId === null);
    if (!config?.secretKeyEncrypted || !config.secretKeyIv || !config.secretKeyAuthTag || config.connectionStatus !== BotBillingConnectionStatus.CONNECTED) throw new BadRequestException(`Stripe ${mode} is not connected`);
    return { config, key: this.encryption.decrypt({ encrypted: config.secretKeyEncrypted, iv: config.secretKeyIv, authTag: config.secretKeyAuthTag }) };
  }

  async validateKey(key: string, mode: BotBillingProviderMode) {
    const expected = mode === BotBillingProviderMode.TEST ? /^(sk|rk)_test_/ : /^(sk|rk)_live_/;
    if (!expected.test(key)) return { status: BotBillingConnectionStatus.INVALID, error: `Stripe key does not match ${mode} mode` };
    try {
      await new Stripe(key).balance.retrieve();
      return { status: BotBillingConnectionStatus.CONNECTED, error: null };
    } catch (error) {
      const stripeError = error as { statusCode?: number; code?: string };
      if (stripeError.statusCode === 401 || stripeError.code === 'api_key_invalid') return { status: BotBillingConnectionStatus.INVALID, error: 'Stripe credential is invalid' };
      return { status: BotBillingConnectionStatus.INVALID, error: 'Stripe validation is temporarily unavailable' };
    }
  }

  async configId(botIntegrationId: string, mode: BotBillingProviderMode) {
    return (await this.resolvedConfig(botIntegrationId, mode)).config.id;
  }

  async ensurePrice(input: { botIntegrationId: string; mode: BotBillingProviderMode; plan: { id: string; name: string; description: string | null }; price: { id: string; currency: string; interval: 'MONTH' | 'YEAR'; amountMinor: number; version: number; providerPriceIdentity: Prisma.JsonValue | null } }) {
    const { key, config } = await this.resolvedConfig(input.botIntegrationId, input.mode);
    const stripe = new Stripe(key);
    const identities = (input.price.providerPriceIdentity && typeof input.price.providerPriceIdentity === 'object' && !Array.isArray(input.price.providerPriceIdentity) ? input.price.providerPriceIdentity : {}) as Record<string, { productId?: string; priceId?: string }>;
    const current = identities.STRIPE?.[input.mode] as { productId?: string; priceId?: string } | undefined;
    if (current?.priceId && (current as { configId?: string }).configId === config.id) return current.priceId;
    try {
      const product = await stripe.products.create({ name: input.plan.name, description: input.plan.description || undefined, metadata: { botIntegrationId: input.botIntegrationId, planId: input.plan.id } }, { idempotencyKey: `product:${input.botIntegrationId}:${input.plan.id}:${input.mode}` });
      const price = await stripe.prices.create({ product: product.id, currency: input.price.currency.toLowerCase(), unit_amount: input.price.amountMinor, recurring: { interval: input.price.interval === 'MONTH' ? 'month' : 'year' }, metadata: { botIntegrationId: input.botIntegrationId, planId: input.plan.id, planPriceId: input.price.id, version: String(input.price.version) } }, { idempotencyKey: `price:${input.price.id}:${input.mode}` });
      const next = { ...identities, STRIPE: { ...((identities.STRIPE as Record<string, unknown>) || {}), [input.mode]: { configId: config.id, productId: product.id, priceId: price.id } } };
      await this.prisma.botPlanPrice.update({ where: { id: input.price.id }, data: { providerPriceIdentity: next as Prisma.InputJsonValue } });
      return price.id;
    } catch { throw new BadGatewayException('Could not synchronize Stripe price'); }
  }

  async customer(input: { botIntegrationId: string; workspaceId: string; telegramBotUserId: string; mode: BotBillingProviderMode }) {
    const existing = await this.prisma.botProviderCustomer.findUnique({ where: { botIntegrationId_telegramBotUserId_provider_mode: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId, provider: BotBillingProvider.STRIPE, mode: input.mode } } });
    if (existing) return existing.providerCustomerId;
    const { key, config } = await this.resolvedConfig(input.botIntegrationId, input.mode);
    const stripe = new Stripe(key);
    const created = await stripe.customers.create({ metadata: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId } }, { idempotencyKey: `customer:${input.botIntegrationId}:${input.telegramBotUserId}:${input.mode}` });
    const row = await this.prisma.botProviderCustomer.upsert({ where: { botIntegrationId_telegramBotUserId_provider_mode: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId, provider: BotBillingProvider.STRIPE, mode: input.mode } }, update: {}, create: { workspaceId: input.workspaceId, botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId, provider: BotBillingProvider.STRIPE, mode: input.mode, providerCustomerId: created.id } });
    return row.providerCustomerId;
  }

  async checkout(input: { botIntegrationId: string; mode: BotBillingProviderMode; customerId: string; priceId: string; subscriptionId: string; successUrl: string; cancelUrl: string; discount?: { code: string; percentOff?: number | null; amountOffMinor?: number | null; currency?: string | null } }) {
    const { key, config } = await this.resolvedConfig(input.botIntegrationId, input.mode);
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer: input.customerId, line_items: [{ price: input.priceId, quantity: 1 }], ...(input.discount ? { discounts: [{ promotion_code: input.discount.code }] } : {}), success_url: input.successUrl, cancel_url: input.cancelUrl, client_reference_id: input.subscriptionId, metadata: { botIntegrationId: input.botIntegrationId, subscriptionId: input.subscriptionId }, subscription_data: { metadata: { botIntegrationId: input.botIntegrationId, subscriptionId: input.subscriptionId } } }, { idempotencyKey: `checkout:${input.subscriptionId}` });
    if (!session.url) throw new BadGatewayException('Stripe did not return a Checkout URL');
    return { checkoutId: session.id, url: session.url };
  }

  async createCoupon(input: { botIntegrationId: string; mode: BotBillingProviderMode; couponId: string; code: string; percentOff: number | null; amountOffMinor: number | null; currency: string | null; maxRedemptions: number | null; expiresAt: Date | null }) {
    const { key, config } = await this.resolvedConfig(input.botIntegrationId, input.mode);
    const stripe = new Stripe(key);
    try {
      const coupon = await stripe.coupons.create({ duration: 'once', name: input.code, ...(input.percentOff ? { percent_off: input.percentOff } : { amount_off: input.amountOffMinor!, currency: input.currency!.toLowerCase() }), metadata: { botIntegrationId: input.botIntegrationId, couponId: input.couponId } }, { idempotencyKey: `coupon:${input.botIntegrationId}:${input.couponId}:${input.mode}` });
      const promotion = await stripe.promotionCodes.create({ promotion: { type: 'coupon', coupon: coupon.id }, code: input.code, max_redemptions: input.maxRedemptions || undefined, expires_at: input.expiresAt ? Math.floor(input.expiresAt.getTime() / 1000) : undefined, metadata: { botIntegrationId: input.botIntegrationId, couponId: input.couponId } }, { idempotencyKey: `promotion:${input.botIntegrationId}:${input.couponId}:${input.mode}` });
      return { configId: config.id, couponId: coupon.id, promotionCodeId: promotion.id };
    } catch { throw new BadGatewayException('Could not synchronize Stripe coupon'); }
  }

  async setCancelAtPeriodEnd(input: { botIntegrationId: string; mode: BotBillingProviderMode; providerSubscriptionId: string; cancelAtPeriodEnd: boolean }) {
    const { key } = await this.resolvedConfig(input.botIntegrationId, input.mode);
    const subscription = await new Stripe(key).subscriptions.update(input.providerSubscriptionId, { cancel_at_period_end: input.cancelAtPeriodEnd });
    return { cancelAtPeriodEnd: subscription.cancel_at_period_end, currentPeriodEnd: (subscription as unknown as { current_period_end?: number }).current_period_end };
  }

  async portal(input: { botIntegrationId: string; mode: BotBillingProviderMode; customerId: string; returnUrl: string }) {
    const { key } = await this.resolvedConfig(input.botIntegrationId, input.mode);
    const session = await new Stripe(key).billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl });
    return session.url;
  }
}
