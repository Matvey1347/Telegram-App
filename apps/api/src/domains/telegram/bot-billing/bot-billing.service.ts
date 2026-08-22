import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BotBillingConnectionStatus, BotBillingProvider, BotBillingProviderMode, BotSubscriptionSource, BotSubscriptionStatus, Prisma, TelegramBotRuntimeEnvironment, WorkspaceRole } from '@prisma/client';
import type { BotBillingOverviewView, BotBillingProviderConfigView, BotBillingSubscriberPage, BotBillingUserPage } from '@telegram-system/shared';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BILLING_PROVIDER_CAPABILITIES } from './bot-billing.providers';
import { BillingSubscribersQueryDto, BillingUsersQueryDto, CreateBillingGrantDto, CreateBillingPlanDto, CreateBillingPlanPriceDto, SetBillingPriceVisibilityDto, UpdateFinanceSupportProfileDto, UpsertBillingProviderConfigDto } from './dto';
import type { CreateBillingCouponDto } from './dto';
import { StripeBillingProvider } from './stripe-billing.provider';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { BotBillingAnalyticsService } from './bot-billing-analytics.service';

type Provider = 'STRIPE' | 'TELEGRAM_STARS';
type Mode = 'TEST' | 'LIVE';

function supportLocale(profileLocale?: string | null, telegramLocale?: string | null): 'en' | 'uk' | 'ru' {
  const locale = (profileLocale || telegramLocale || 'en').toLowerCase().split(/[-_]/u)[0];
  return locale === 'uk' || locale === 'ru' ? locale : 'en';
}

@Injectable()
export class BotBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly encryption: TokenEncryptionService,
    private readonly logger: ApplicationLoggerService,
    private readonly stripe: StripeBillingProvider,
    private readonly botApi: TelegramBotApiClient,
    private readonly analytics: BotBillingAnalyticsService,
  ) {}

  private async admin(userId: string) {
    return this.workspace.requireWorkspaceRole(userId, [WorkspaceRole.owner, WorkspaceRole.admin]);
  }

  private async bot(userId: string, botIntegrationId: string) {
    const membership = await this.admin(userId);
    const bot = await this.prisma.telegramBotIntegration.findFirst({ where: { id: botIntegrationId, workspaceId: membership.workspaceId }, select: { id: true, workspaceId: true } });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    return bot;
  }

  private async rejectFinanceCatalogMutation(botIntegrationId: string) {
    const finance = await this.prisma.telegramBotIntegration.findFirst({ where: { id: botIntegrationId, applicationType: 'FINANCE' }, select: { id: true } });
    if (finance) throw new BadRequestException('Finance uses the fixed Free, Pro and Ultimate catalog; synchronize canonical plans instead');
  }

  private mask(value?: string | null) {
    if (!value) return null;
    return value.length <= 8 ? '••••' : `${value.slice(0, 4)}••••${value.slice(-4)}`;
  }

  private toProviderView(row: { provider: BotBillingProvider; mode: BotBillingProviderMode; connectionStatus: BotBillingConnectionStatus; publicKey: string | null; publicKeyMasked: string | null; secretKeyEncrypted: string | null; webhookSecretEncrypted: string | null; lastCheckedAt: Date | null; lastValidationError: string | null } | null, provider: Provider, mode: Mode, source: BotBillingProviderConfigView['source']): BotBillingProviderConfigView {
    return { provider, mode, source, status: row?.connectionStatus || 'NOT_CONFIGURED', publicKeyConfigured: Boolean(row?.publicKey || row?.publicKeyMasked), publicKeyMasked: row?.publicKeyMasked || null, secretKeyConfigured: Boolean(row?.secretKeyEncrypted), webhookSecretConfigured: Boolean(row?.webhookSecretEncrypted), lastCheckedAt: row?.lastCheckedAt?.toISOString() || null, lastValidationError: row?.lastValidationError || null, capabilities: BILLING_PROVIDER_CAPABILITIES[provider] };
  }

  private nonBlank(value: string | undefined) { return value?.trim() || undefined; }

  private validateStripeCredential(value: string, mode: Mode, kind: 'public' | 'secret' | 'webhook') {
    const valid = kind === 'webhook'
      ? /^whsec_[A-Za-z0-9]+$/.test(value)
      : kind === 'public'
        ? new RegExp(`^pk_${mode.toLowerCase()}_[A-Za-z0-9]+$`).test(value)
        : new RegExp(`^(?:sk|rk)_${mode.toLowerCase()}_[A-Za-z0-9]+$`).test(value);
    if (!valid) throw new BadRequestException(kind === 'webhook' ? 'Stripe webhook signing secret is invalid' : `Stripe ${kind} key does not match ${mode} mode`);
  }

  async providerResolution(userId: string, botIntegrationId: string) {
    const bot = await this.bot(userId, botIntegrationId);
    const rows = await this.prisma.botBillingProviderConfig.findMany({ where: { workspaceId: bot.workspaceId, OR: [{ botIntegrationId }, { botIntegrationId: null }] } });
    return (['STRIPE', 'TELEGRAM_STARS'] as const).flatMap((provider) =>
      (['TEST', 'LIVE'] as const).map((mode) => {
        const override = rows.find((row) => row.provider === provider && row.mode === mode && row.botIntegrationId === botIntegrationId);
        const defaultConfig = rows.find((row) => row.provider === provider && row.mode === mode && row.botIntegrationId === null);
        return this.toProviderView(override || defaultConfig || null, provider, mode, override ? 'BOT_OVERRIDE' : defaultConfig ? 'WORKSPACE_DEFAULT' : 'NONE');
      }),
    );
  }

  async workspaceProviderResolution(userId: string) {
    const membership = await this.admin(userId);
    const rows = await this.prisma.botBillingProviderConfig.findMany({ where: { workspaceId: membership.workspaceId, botIntegrationId: null }, orderBy: { createdAt: 'desc' } });
    return (['STRIPE', 'TELEGRAM_STARS'] as const).flatMap((provider) =>
      (['TEST', 'LIVE'] as const).map((mode) => {
        const row = rows.find((item) => item.provider === provider && item.mode === mode);
        return this.toProviderView(row || null, provider, mode, row ? 'WORKSPACE_DEFAULT' : 'NONE');
      }),
    );
  }

  async removeWorkspaceProviderDefault(userId: string, provider: Provider, mode: Mode) {
    const membership = await this.admin(userId);
    await this.prisma.botBillingProviderConfig.deleteMany({ where: { workspaceId: membership.workspaceId, botIntegrationId: null, provider, mode } });
    this.audit(membership.workspaceId, userId, 'billing.workspace_provider_disabled', { provider, mode });
    return this.toProviderView(null, provider, mode, 'NONE');
  }

  async saveProviderConfig(userId: string, input: { botIntegrationId?: string; provider: Provider; mode: Mode; dto: UpsertBillingProviderConfigDto }) {
    const membership = await this.admin(userId);
    if (input.botIntegrationId) await this.bot(userId, input.botIntegrationId);
    const data = input.dto;
    const secretValue = this.nonBlank(data.secretKey);
    const webhookValue = this.nonBlank(data.webhookSecret);
    const publicKey = this.nonBlank(data.publicKey);
    if (input.provider === 'STRIPE') {
      if (secretValue) this.validateStripeCredential(secretValue, input.mode, 'secret');
      if (webhookValue) this.validateStripeCredential(webhookValue, input.mode, 'webhook');
      if (publicKey) this.validateStripeCredential(publicKey, input.mode, 'public');
    }
    const secret = secretValue ? this.encryption.encrypt(secretValue) : undefined;
    const webhook = webhookValue ? this.encryption.encrypt(webhookValue) : undefined;
    const identity = { workspaceId: membership.workspaceId, botIntegrationId: input.botIntegrationId || null, provider: input.provider, mode: input.mode };
    const values = { ...(secret ? { secretKeyEncrypted: secret.encrypted, secretKeyIv: secret.iv, secretKeyAuthTag: secret.authTag } : {}), ...(webhook ? { webhookSecretEncrypted: webhook.encrypted, webhookSecretIv: webhook.iv, webhookSecretAuthTag: webhook.authTag } : {}), ...(publicKey ? { publicKey, publicKeyMasked: this.mask(publicKey) } : {}), connectionStatus: BotBillingConnectionStatus.NOT_CONFIGURED, lastValidationError: null };
    const existing = await this.prisma.botBillingProviderConfig.findFirst({ where: identity });
    // A first override inherits the complete resolved default. Blank inputs
    // therefore preserve effective credentials instead of shadowing them.
    const inherited = !existing && input.botIntegrationId
      ? await this.prisma.botBillingProviderConfig.findFirst({
          where: { workspaceId: membership.workspaceId, botIntegrationId: null, provider: input.provider, mode: input.mode },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    let config = existing
      ? await this.prisma.botBillingProviderConfig.update({ where: { id: existing.id }, data: values })
      : await this.prisma.botBillingProviderConfig.create({ data: {
          ...identity,
          ...(inherited ? {
            secretKeyEncrypted: inherited.secretKeyEncrypted,
            secretKeyIv: inherited.secretKeyIv,
            secretKeyAuthTag: inherited.secretKeyAuthTag,
            webhookSecretEncrypted: inherited.webhookSecretEncrypted,
            webhookSecretIv: inherited.webhookSecretIv,
            webhookSecretAuthTag: inherited.webhookSecretAuthTag,
            publicKey: inherited.publicKey,
            publicKeyMasked: inherited.publicKeyMasked,
          } : {}),
          ...values,
        } });
    if (input.provider === 'STRIPE') {
      if (!config.secretKeyEncrypted || !config.secretKeyIv || !config.secretKeyAuthTag || !config.webhookSecretEncrypted || !config.webhookSecretIv || !config.webhookSecretAuthTag) {
        config = await this.prisma.botBillingProviderConfig.update({ where: { id: config.id }, data: { connectionStatus: BotBillingConnectionStatus.NOT_CONFIGURED, lastCheckedAt: new Date(), lastValidationError: !config.secretKeyEncrypted ? 'Stripe secret key is required' : 'Stripe webhook secret is required' } });
      } else {
        const key = this.encryption.decrypt({ encrypted: config.secretKeyEncrypted, iv: config.secretKeyIv, authTag: config.secretKeyAuthTag });
        const validation = await this.stripe.validateKey(key, input.mode as BotBillingProviderMode);
        config = await this.prisma.botBillingProviderConfig.update({ where: { id: config.id }, data: { connectionStatus: validation.status, lastCheckedAt: new Date(), lastValidationError: validation.error } });
      }
    }
    if (input.provider === 'TELEGRAM_STARS') config = await this.prisma.botBillingProviderConfig.update({ where: { id: config.id }, data: { connectionStatus: BotBillingConnectionStatus.CONNECTED, lastCheckedAt: new Date(), lastValidationError: null } });
    this.audit(membership.workspaceId, userId, 'billing.provider_config_changed', { provider: input.provider, mode: input.mode, botIntegrationId: input.botIntegrationId || null });
    return this.toProviderView(config, input.provider, input.mode, input.botIntegrationId ? 'BOT_OVERRIDE' : 'WORKSPACE_DEFAULT');
  }

  async useWorkspaceProviderDefault(userId: string, botIntegrationId: string, provider: Provider, mode: Mode) {
    const bot = await this.bot(userId, botIntegrationId);
    await this.prisma.botBillingProviderConfig.deleteMany({ where: { workspaceId: bot.workspaceId, botIntegrationId, provider, mode } });
    const fallback = await this.prisma.botBillingProviderConfig.findFirst({ where: { workspaceId: bot.workspaceId, botIntegrationId: null, provider, mode } });
    this.audit(bot.workspaceId, userId, 'billing.provider_override_reset', { provider, mode, botIntegrationId });
    return this.toProviderView(fallback, provider, mode, fallback ? 'WORKSPACE_DEFAULT' : 'NONE');
  }

  async createPlan(userId: string, botIntegrationId: string, dto: CreateBillingPlanDto) {
    const bot = await this.bot(userId, botIntegrationId);
    await this.rejectFinanceCatalogMutation(botIntegrationId);
    return this.prisma.botSubscriptionPlan.create({ data: { workspaceId: bot.workspaceId, botIntegrationId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), description: dto.description?.trim() || null } });
  }

  async addPrice(userId: string, botIntegrationId: string, planId: string, dto: CreateBillingPlanPriceDto) {
    const bot = await this.bot(userId, botIntegrationId);
    await this.rejectFinanceCatalogMutation(botIntegrationId);
    const plan = await this.prisma.botSubscriptionPlan.findFirst({ where: { id: planId, botIntegrationId, workspaceId: bot.workspaceId } });
    if (!plan) throw new NotFoundException('Billing plan not found');
    const currency = dto.currency.toUpperCase();
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.botPlanPrice.aggregate({ where: { planId, currency, interval: dto.interval }, _max: { version: true } });
      // A replacement is a new immutable version. Existing subscribers keep their price row/snapshot.
      await tx.botPlanPrice.updateMany({ where: { planId, currency, interval: dto.interval, isPublic: true }, data: { isPublic: false } });
      return tx.botPlanPrice.create({ data: { planId, currency, interval: dto.interval, amountMinor: dto.amountMinor, version: (latest._max.version || 0) + 1 } });
    });
  }

  async setPriceVisibility(userId: string, botIntegrationId: string, priceId: string, dto: SetBillingPriceVisibilityDto) {
    const bot = await this.bot(userId, botIntegrationId);
    await this.rejectFinanceCatalogMutation(botIntegrationId);
    const price = await this.prisma.botPlanPrice.findFirst({ where: { id: priceId, plan: { botIntegrationId, workspaceId: bot.workspaceId } }, include: { _count: { select: { subscriptions: true } } } });
    if (!price) throw new NotFoundException('Plan price not found');
    // Amount, currency, interval and version deliberately never appear in this update.
    return this.prisma.botPlanPrice.update({ where: { id: priceId }, data: { isPublic: dto.isPublic, ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }) } });
  }

  async grant(userId: string, botIntegrationId: string, dto: CreateBillingGrantDto) {
    const bot = await this.bot(userId, botIntegrationId);
    const [subscriber, plan] = await Promise.all([
      this.prisma.telegramBotUser.findFirst({ where: { id: dto.telegramBotUserId, botIntegrationId, workspaceId: bot.workspaceId } }),
      this.prisma.botSubscriptionPlan.findFirst({ where: { id: dto.planId, botIntegrationId, workspaceId: bot.workspaceId } }),
    ]);
    if (!subscriber || !plan) throw new NotFoundException('Subscriber or plan not found');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw new BadRequestException('Grant expiry must be in the future');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.botSubscriptionGrant.findUnique({ where: { idempotencyKey: dto.idempotencyKey }, include: { subscription: true } });
      if (existing) {
        if (existing.subscription.workspaceId !== bot.workspaceId || existing.subscription.botIntegrationId !== botIntegrationId || existing.subscription.telegramBotUserId !== subscriber.id) {
          throw new BadRequestException('Idempotency key is already used by another billing operation');
        }
        return existing.subscription;
      }
      const subscription = await tx.botSubscription.create({ data: { workspaceId: bot.workspaceId, botIntegrationId, telegramBotUserId: subscriber.id, planId: plan.id, source: dto.source as BotSubscriptionSource, status: BotSubscriptionStatus.ACTIVE, currentPeriodStart: new Date(), currentPeriodEnd: expiresAt } });
      await tx.botSubscriptionGrant.create({ data: { subscriptionId: subscription.id, source: dto.source, reason: dto.reason.trim(), idempotencyKey: dto.idempotencyKey, expiresAt, createdByUserId: userId } });
      await tx.botBillingEvent.create({ data: { workspaceId: bot.workspaceId, botIntegrationId, subscriptionId: subscription.id, type: 'GRANT_CREATED' } });
      return subscription;
    });
  }

  async catalog(botIntegrationId: string, telegramBotUserId: string) {
    const bot = await this.prisma.telegramBotIntegration.findUnique({ where: { id: botIntegrationId }, select: { workspaceId: true } });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const [plans, entitlement, providers] = await Promise.all([
      this.prisma.botSubscriptionPlan.findMany({ where: { botIntegrationId, isActive: true }, select: { id: true, code: true, name: true, description: true, prices: { where: { isActive: true, isPublic: true }, orderBy: [{ currency: 'asc' }, { interval: 'asc' }, { version: 'desc' }] } } }),
      this.prisma.botSubscription.findMany({ where: { botIntegrationId, telegramBotUserId }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, source: true, status: true, currency: true, interval: true, amountMinor: true, priceVersion: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } }),
      this.prisma.botBillingProviderConfig.findMany({ where: { workspaceId: bot.workspaceId, connectionStatus: BotBillingConnectionStatus.CONNECTED, OR: [{ botIntegrationId }, { botIntegrationId: null }] }, select: { provider: true, mode: true, botIntegrationId: true } }),
    ]);
    const resolvedProviders = new Map<string, (typeof providers)[number]>();
    for (const item of providers) { const key = `${item.provider}:${item.mode}`; if (!resolvedProviders.has(key) || item.botIntegrationId === botIntegrationId) resolvedProviders.set(key, item); }
    const available = [...resolvedProviders.values()].filter((item) => item.mode === 'LIVE' || process.env.NODE_ENV !== 'production').map((item) => ({ provider: item.provider, mode: item.mode, capabilities: BILLING_PROVIDER_CAPABILITIES[item.provider] }));
    return { plans, subscriptions: entitlement, providers: available };
  }

  async createStripeCheckout(input: { botIntegrationId: string; telegramBotUserId: string; priceId: string; requestedMode?: Mode; couponCode?: string }) {
    const mode = process.env.NODE_ENV === 'production' ? BotBillingProviderMode.LIVE : (input.requestedMode || BotBillingProviderMode.LIVE) as BotBillingProviderMode;
    const price = await this.prisma.botPlanPrice.findFirst({ where: { id: input.priceId, isActive: true, isPublic: true, plan: { botIntegrationId: input.botIntegrationId, isActive: true } }, include: { plan: true } });
    if (!price) throw new NotFoundException('Public billing price not found');
    const isFinance = await this.assertFinanceCanonicalPrice(input.botIntegrationId, price.plan.code, price.currency, price.interval, price.amountMinor);
    const subscriber = await this.prisma.telegramBotUser.findFirst({ where: { id: input.telegramBotUserId, botIntegrationId: input.botIntegrationId }, select: { id: true, workspaceId: true } });
    if (!subscriber || subscriber.workspaceId !== price.plan.workspaceId) throw new NotFoundException('Billing subscriber not found');
    const coupon = input.couponCode ? await this.validCoupon({ botIntegrationId: input.botIntegrationId, telegramBotUserId: subscriber.id, planId: price.planId, priceId: price.id, currency: price.currency, code: input.couponCode }) : null;
    const stripeConfigId = await this.stripe.configId(input.botIntegrationId, mode);
    const syncedPriceId = this.providerPriceId(price.providerPriceIdentity, mode, stripeConfigId);
    if (isFinance && !syncedPriceId) throw new BadRequestException('Finance plans are not synchronized with the selected Stripe mode');
    const providerPriceId = syncedPriceId || await this.stripe.ensurePrice({ botIntegrationId: input.botIntegrationId, mode, plan: price.plan, price });
    const promotionCodeId = coupon ? this.providerPromotionCode(coupon.providerCouponIdentity, mode, stripeConfigId) : null;
    if (coupon && !promotionCodeId) throw new BadRequestException('Coupon is not synchronized with the selected Stripe mode');
    const customerId = await this.stripe.customer({ botIntegrationId: input.botIntegrationId, workspaceId: subscriber.workspaceId, telegramBotUserId: subscriber.id, mode });
    const subscription = await this.prisma.botSubscription.create({ data: { workspaceId: subscriber.workspaceId, botIntegrationId: input.botIntegrationId, telegramBotUserId: subscriber.id, planId: price.planId, planPriceId: price.id, source: 'STRIPE', status: 'INCOMPLETE', currency: price.currency, interval: price.interval, amountMinor: price.amountMinor, priceVersion: price.version, providerCustomerId: customerId } });
    const base = (process.env.FINANCE_MINI_APP_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
    if (!base) throw new BadRequestException('Finance Mini App URL is not configured');
    try {
      const checkout = await this.stripe.checkout({ botIntegrationId: input.botIntegrationId, mode, customerId, priceId: providerPriceId, subscriptionId: subscription.id, successUrl: `${base}/finance/${input.botIntegrationId}?checkout=success`, cancelUrl: `${base}/finance/${input.botIntegrationId}?checkout=cancelled`, discount: promotionCodeId ? { code: promotionCodeId } : undefined });
      if (coupon) await this.prisma.botCouponRedemption.create({ data: { couponId: coupon.id, telegramBotUserId: subscriber.id, planPriceId: price.id, subscriptionId: subscription.id, idempotencyKey: `checkout:${subscription.id}` } });
      return { ...checkout, subscriptionId: subscription.id };
    } catch (error) {
      await this.prisma.botSubscription.delete({ where: { id: subscription.id } });
      throw error;
    }
  }

  private providerPriceId(value: Prisma.JsonValue | null, mode: BotBillingProviderMode, configId: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const stripe = (value as Record<string, unknown>).STRIPE;
    const entry = stripe && typeof stripe === 'object' && !Array.isArray(stripe) ? (stripe as Record<string, unknown>)[mode] : null;
    return entry && typeof entry === 'object' && !Array.isArray(entry) && (entry as Record<string, unknown>).configId === configId && typeof (entry as Record<string, unknown>).priceId === 'string' ? (entry as Record<string, string>).priceId : null;
  }

  private async assertFinanceCanonicalPrice(botIntegrationId: string, code: string, currency: string, interval: string, amountMinor: number) {
    const bot = await this.prisma.telegramBotIntegration.findUnique({ where: { id: botIntegrationId }, select: { applicationType: true } });
    if (bot?.applicationType !== 'FINANCE') return false;
    const canonical: Record<string, number> = { PRO: 14900, ULTIMATE: 24900 };
    if (canonical[code] !== amountMinor || currency !== 'UAH' || interval !== 'MONTH') throw new BadRequestException('Finance checkout requires a canonical Pro or Ultimate monthly price');
    return true;
  }

  async syncFinanceCatalog(userId: string, botIntegrationId: string, mode: Mode = 'LIVE') {
    const bot = await this.bot(userId, botIntegrationId);
    const finance = await this.prisma.telegramBotIntegration.findFirst({ where: { id: bot.id, applicationType: 'FINANCE' } });
    if (!finance) throw new BadRequestException('This operation is available only for Finance bots');
    const definitions = [{ code: 'PRO', name: 'Pro', amountMinor: 14900 }, { code: 'ULTIMATE', name: 'Ultimate', amountMinor: 24900 }];
    const result: Array<{ code: string; planId: string; priceId: string; providerPriceId: string }> = [];
    for (const definition of definitions) {
      const plan = await this.prisma.botSubscriptionPlan.upsert({ where: { botIntegrationId_code: { botIntegrationId, code: definition.code } }, update: { name: definition.name, isActive: true }, create: { workspaceId: bot.workspaceId, botIntegrationId, code: definition.code, name: definition.name, isActive: true } });
      let price = await this.prisma.botPlanPrice.findFirst({ where: { planId: plan.id, currency: 'UAH', interval: 'MONTH', amountMinor: definition.amountMinor, isActive: true }, orderBy: { version: 'desc' } });
      if (!price) {
        const previous = await this.prisma.botPlanPrice.aggregate({ where: { planId: plan.id, currency: 'UAH', interval: 'MONTH' }, _max: { version: true } });
        await this.prisma.botPlanPrice.updateMany({ where: { planId: plan.id, currency: 'UAH', interval: 'MONTH', isPublic: true }, data: { isPublic: false } });
        price = await this.prisma.botPlanPrice.create({ data: { planId: plan.id, currency: 'UAH', interval: 'MONTH', amountMinor: definition.amountMinor, version: (previous._max.version || 0) + 1, isPublic: true } });
      }
      const providerPriceId = await this.stripe.ensurePrice({ botIntegrationId, mode: mode as BotBillingProviderMode, plan, price });
      result.push({ code: definition.code, planId: plan.id, priceId: price.id, providerPriceId });
    }
    return result;
  }

  private providerPromotionCode(value: Prisma.JsonValue | null, mode: BotBillingProviderMode, configId?: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const stripe = (value as Record<string, unknown>).STRIPE;
    if (!stripe || typeof stripe !== 'object' || Array.isArray(stripe)) return null;
    const entry = (stripe as Record<string, unknown>)[mode];
    return entry && typeof entry === 'object' && !Array.isArray(entry) && (!configId || (entry as Record<string, unknown>).configId === configId) && typeof (entry as Record<string, unknown>).promotionCodeId === 'string' ? (entry as Record<string, string>).promotionCodeId : null;
  }

  async syncCouponToStripe(userId: string, botIntegrationId: string, couponId: string, mode: Mode = 'LIVE') {
    const bot = await this.bot(userId, botIntegrationId);
    const coupon = await this.prisma.botCoupon.findFirst({ where: { id: couponId, workspaceId: bot.workspaceId, botIntegrationId } });
    if (!coupon) throw new NotFoundException('Billing coupon not found');
    const configId = await this.stripe.configId(botIntegrationId, mode as BotBillingProviderMode);
    const existing = this.providerPromotionCode(coupon.providerCouponIdentity, mode, configId);
    if (existing) return coupon;
    const identity = await this.stripe.createCoupon({ botIntegrationId, mode: mode as BotBillingProviderMode, couponId: coupon.id, code: coupon.code, percentOff: coupon.percentOff, amountOffMinor: coupon.amountOffMinor, currency: coupon.currency, maxRedemptions: coupon.maxRedemptions, expiresAt: coupon.expiresAt });
    const current = coupon.providerCouponIdentity && typeof coupon.providerCouponIdentity === 'object' && !Array.isArray(coupon.providerCouponIdentity) ? coupon.providerCouponIdentity as Record<string, unknown> : {};
    return this.prisma.botCoupon.update({ where: { id: coupon.id }, data: { providerCouponIdentity: { ...current, STRIPE: { ...((current.STRIPE as Record<string, unknown>) || {}), [mode]: identity } } as Prisma.InputJsonValue } });
  }

  async setStripeAutoRenewal(input: { botIntegrationId: string; telegramBotUserId: string; cancelAtPeriodEnd: boolean }) {
    const subscription = await this.prisma.botSubscription.findFirst({ where: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId, source: BotSubscriptionSource.STRIPE, status: { in: [BotSubscriptionStatus.ACTIVE, BotSubscriptionStatus.PAST_DUE] }, providerSubscription: { is: { provider: BotBillingProvider.STRIPE } } }, orderBy: { createdAt: 'desc' }, include: { providerSubscription: true } });
    if (!subscription?.providerSubscription) throw new NotFoundException('Active Stripe subscription not found');
    const result = await this.stripe.setCancelAtPeriodEnd({ botIntegrationId: input.botIntegrationId, mode: subscription.providerSubscription.mode, providerSubscriptionId: subscription.providerSubscription.providerSubscriptionId, cancelAtPeriodEnd: input.cancelAtPeriodEnd });
    return this.prisma.botSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: result.cancelAtPeriodEnd, currentPeriodEnd: result.currentPeriodEnd ? new Date(result.currentPeriodEnd * 1000) : subscription.currentPeriodEnd } });
  }

  async stripePortal(input: { botIntegrationId: string; telegramBotUserId: string; returnUrl: string }) {
    const customer = await this.prisma.botProviderCustomer.findFirst({ where: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId, provider: BotBillingProvider.STRIPE }, orderBy: { updatedAt: 'desc' } });
    if (!customer) throw new NotFoundException('Stripe customer not found');
    return { url: await this.stripe.portal({ botIntegrationId: input.botIntegrationId, mode: customer.mode, customerId: customer.providerCustomerId, returnUrl: input.returnUrl }) };
  }

  private async validCoupon(input: { botIntegrationId: string; telegramBotUserId: string; planId: string; priceId: string; currency: string; code: string }) {
    const now = new Date(); const coupon = await this.prisma.botCoupon.findFirst({ where: { botIntegrationId: input.botIntegrationId, code: input.code.trim().toUpperCase(), isActive: true } });
    if (!coupon || (coupon.startsAt && coupon.startsAt > now) || (coupon.expiresAt && coupon.expiresAt <= now) || (coupon.planId && coupon.planId !== input.planId) || (coupon.amountOffMinor && coupon.currency !== input.currency)) throw new BadRequestException('Coupon is invalid for this price');
    const [uses, existing, paid] = await Promise.all([this.prisma.botCouponRedemption.count({ where: { couponId: coupon.id } }), this.prisma.botCouponRedemption.findFirst({ where: { couponId: coupon.id, telegramBotUserId: input.telegramBotUserId, planPriceId: input.priceId } }), coupon.newUsersOnly ? this.prisma.botSubscription.count({ where: { botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId, status: { in: ['ACTIVE', 'CANCELED', 'PAST_DUE'] } } }) : Promise.resolve(0)]);
    if (existing || (coupon.maxRedemptions && uses >= coupon.maxRedemptions) || paid) throw new BadRequestException('Coupon redemption is not eligible');
    return coupon;
  }

  async createStarsCheckout(input: { botIntegrationId: string; telegramBotUserId: string; priceId: string }) {
    const price = await this.prisma.botPlanPrice.findFirst({ where: { id: input.priceId, currency: 'XTR', interval: 'MONTH', isActive: true, isPublic: true, plan: { botIntegrationId: input.botIntegrationId, isActive: true } }, include: { plan: true } });
    if (!price || price.amountMinor > 10000) throw new NotFoundException('Public monthly Stars price not found');
    const starConfigs = await this.prisma.botBillingProviderConfig.findMany({ where: { workspaceId: price.plan.workspaceId, provider: 'TELEGRAM_STARS', mode: 'LIVE', connectionStatus: 'CONNECTED', OR: [{ botIntegrationId: input.botIntegrationId }, { botIntegrationId: null }] } });
    const config = starConfigs.find((item) => item.botIntegrationId === input.botIntegrationId) || starConfigs.find((item) => item.botIntegrationId === null);
    if (!config) throw new BadRequestException('Telegram Stars is not enabled');
    const environment = process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT === 'LOCAL'
      ? TelegramBotRuntimeEnvironment.LOCAL
      : process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT === 'PRODUCTION' || process.env.NODE_ENV === 'production'
        ? TelegramBotRuntimeEnvironment.PRODUCTION
        : null;
    const bot = environment ? await this.prisma.telegramBotRuntimeInstance.findFirst({ where: { botIntegrationId: input.botIntegrationId, workspaceId: price.plan.workspaceId, environment, runtimeStatus: 'ACTIVE' }, select: { botTokenEncrypted: true, botTokenIv: true, botTokenAuthTag: true } }) : null;
    const subscriber = await this.prisma.telegramBotUser.findFirst({ where: { id: input.telegramBotUserId, botIntegrationId: input.botIntegrationId, workspaceId: price.plan.workspaceId } });
    if (!bot || !subscriber) throw new NotFoundException('Billing subscriber not found');
    const subscription = await this.prisma.botSubscription.create({ data: { workspaceId: price.plan.workspaceId, botIntegrationId: input.botIntegrationId, telegramBotUserId: subscriber.id, planId: price.planId, planPriceId: price.id, source: 'TELEGRAM_STARS', status: 'INCOMPLETE', currency: 'XTR', interval: 'MONTH', amountMinor: price.amountMinor, priceVersion: price.version } });
    const token = this.encryption.decrypt({ encrypted: bot.botTokenEncrypted, iv: bot.botTokenIv, authTag: bot.botTokenAuthTag });
    try {
      const url = await this.botApi.createInvoiceLink(token, { title: price.plan.name.slice(0, 32), description: (price.plan.description || 'Finance Pro monthly subscription').slice(0, 255), payload: `fin_sub:${subscription.id}`, currency: 'XTR', prices: [{ label: price.plan.name, amount: price.amountMinor }], subscription_period: 2592000 });
      return { subscriptionId: subscription.id, url };
    } catch (error) { await this.prisma.botSubscription.delete({ where: { id: subscription.id } }); throw error; }
  }

  async validateStarsPreCheckout(input: { botIntegrationId: string; telegramBotUserId: string; payload?: string; currency?: string; totalAmount?: number }) {
    const id = input.payload?.startsWith('fin_sub:') ? input.payload.slice(8) : '';
    const subscription = id ? await this.prisma.botSubscription.findFirst({ where: { id, botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId, source: 'TELEGRAM_STARS', status: 'INCOMPLETE' } }) : null;
    return Boolean(subscription && input.currency === 'XTR' && subscription.amountMinor === input.totalAmount);
  }

  async processStarsPayment(input: { botIntegrationId: string; telegramBotUserId: string; payment: { invoice_payload?: string; currency?: string; total_amount?: number; telegram_payment_charge_id?: string; subscription_expiration_date?: number } }) {
    const id = input.payment.invoice_payload?.startsWith('fin_sub:') ? input.payment.invoice_payload.slice(8) : '';
    const chargeId = input.payment.telegram_payment_charge_id;
    if (!id || !chargeId || input.payment.currency !== 'XTR') throw new BadRequestException('Invalid Telegram Stars payment');
    const subscription = await this.prisma.botSubscription.findFirst({ where: { id, botIntegrationId: input.botIntegrationId, telegramBotUserId: input.telegramBotUserId, source: 'TELEGRAM_STARS', amountMinor: input.payment.total_amount } });
    if (!subscription) throw new BadRequestException('Telegram Stars payment does not match a subscription');
    const duplicate = await this.prisma.botBillingEvent.findFirst({ where: { provider: 'TELEGRAM_STARS', mode: 'LIVE', providerEventId: chargeId } });
    if (duplicate) return { activated: true, duplicate: true };
    const end = input.payment.subscription_expiration_date ? new Date(input.payment.subscription_expiration_date * 1000) : new Date(Date.now() + 2592000 * 1000);
    await this.prisma.$transaction(async (tx) => {
      await tx.botSubscription.update({ where: { id: subscription.id }, data: { status: 'ACTIVE', providerSubscriptionId: chargeId, currentPeriodStart: new Date(), currentPeriodEnd: end } });
      await tx.botProviderSubscription.upsert({ where: { subscriptionId: subscription.id }, update: { providerStatus: 'ACTIVE', lastSyncedAt: new Date() }, create: { subscriptionId: subscription.id, provider: 'TELEGRAM_STARS', mode: 'LIVE', providerSubscriptionId: chargeId, providerStatus: 'ACTIVE' } });
      await tx.botBillingEvent.create({ data: { workspaceId: subscription.workspaceId, botIntegrationId: subscription.botIntegrationId, subscriptionId: subscription.id, provider: 'TELEGRAM_STARS', mode: 'LIVE', providerEventId: chargeId, type: 'PAYMENT_SUCCEEDED', amountMinor: input.payment.total_amount, currency: 'XTR' } });
    });
    return { activated: true, duplicate: false };
  }

  async revokeGrant(userId: string, botIntegrationId: string, grantId: string, reason: string) {
    const bot = await this.bot(userId, botIntegrationId);
    const grant = await this.prisma.botSubscriptionGrant.findFirst({ where: { id: grantId, subscription: { botIntegrationId, workspaceId: bot.workspaceId } }, include: { subscription: true } });
    if (!grant) throw new NotFoundException('Billing grant not found');
    if (grant.revokedAt) return grant;
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.botSubscriptionGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date(), reason: `${grant.reason}\nRevoked: ${reason.trim()}` } });
      await tx.botBillingEvent.create({ data: { workspaceId: bot.workspaceId, botIntegrationId, subscriptionId: grant.subscriptionId, type: 'GRANT_REVOKED', payload: { reason: reason.trim() } } });
      return revoked;
    });
  }

  async createCoupon(userId: string, botIntegrationId: string, dto: CreateBillingCouponDto) {
    const bot = await this.bot(userId, botIntegrationId);
    if (Boolean(dto.percentOff) === Boolean(dto.amountOffMinor)) throw new BadRequestException('Choose exactly one coupon discount type');
    if (dto.amountOffMinor && !dto.currency) throw new BadRequestException('Fixed coupons require an explicit currency');
    if (dto.planId && !await this.prisma.botSubscriptionPlan.findFirst({ where: { id: dto.planId, botIntegrationId, workspaceId: bot.workspaceId } })) throw new NotFoundException('Billing plan not found');
    const coupon = await this.prisma.botCoupon.create({ data: { workspaceId: bot.workspaceId, botIntegrationId, planId: dto.planId || null, code: dto.code.trim().toUpperCase(), percentOff: dto.percentOff || null, amountOffMinor: dto.amountOffMinor || null, currency: dto.currency?.toUpperCase() || null, startsAt: dto.startsAt ? new Date(dto.startsAt) : null, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null, maxRedemptions: dto.maxRedemptions || null, newUsersOnly: Boolean(dto.newUsersOnly) } });
    const finance = await this.prisma.telegramBotIntegration.findFirst({ where: { id: botIntegrationId, applicationType: 'FINANCE' }, select: { id: true } });
    if (!finance) return coupon;
    try { return await this.syncCouponToStripe(userId, botIntegrationId, coupon.id); }
    catch (error) { await this.prisma.botCoupon.delete({ where: { id: coupon.id } }); throw error; }
  }

  async overview(userId: string, botIntegrationId: string, environment: 'LOCAL' | 'PRODUCTION' = 'PRODUCTION') {
    const bot = await this.bot(userId, botIntegrationId);
    const runtime = { runtimeInstance: { is: { environment: environment as TelegramBotRuntimeEnvironment } } };
    const [subscriptionMetrics, registeredUsers, revenue, recentEvents, recentSubscriptions, aiUsage] = await Promise.all([
      this.prisma.botSubscription.findMany({ where: { botIntegrationId, workspaceId: bot.workspaceId, telegramBotUser: runtime }, select: { telegramBotUserId: true, status: true, currency: true, interval: true, amountMinor: true, currentPeriodEnd: true, providerSubscription: { select: { mode: true } } } }),
      this.prisma.telegramBotUser.count({ where: { botIntegrationId, workspaceId: bot.workspaceId, ...runtime } }),
      this.prisma.botBillingEvent.groupBy({ by: ['currency'], where: { botIntegrationId, workspaceId: bot.workspaceId, type: 'PAYMENT_SUCCEEDED', mode: BotBillingProviderMode.LIVE, subscription: { telegramBotUser: runtime } }, _sum: { amountMinor: true } }),
      this.prisma.botBillingEvent.findMany({ where: { botIntegrationId, workspaceId: bot.workspaceId, type: { in: ['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED'] }, subscription: { telegramBotUser: runtime } }, orderBy: { occurredAt: 'desc' }, take: 12, select: { id: true, type: true, occurredAt: true, subscriptionId: true, amountMinor: true, currency: true, subscription: { select: { telegramBotUser: { select: { id: true, telegramUserId: true, username: true, firstName: true } }, plan: { select: { id: true, name: true } } } } } }),
      this.prisma.botSubscription.findMany({ where: { botIntegrationId, workspaceId: bot.workspaceId, telegramBotUser: runtime }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, createdAt: true, amountMinor: true, currency: true, telegramBotUser: { select: { id: true, telegramUserId: true, username: true, firstName: true } }, plan: { select: { id: true, name: true } } } }),
      this.analytics.aiUsage(bot.workspaceId, botIntegrationId, environment),
    ]);
    const analytics = this.analytics.calculate(registeredUsers, subscriptionMetrics);
    analytics.collectedRevenue = revenue.map((row) => ({ currency: row.currency, amountMinor: row._sum.amountMinor || 0 }));
    const recentActivity = [
      ...recentEvents.map((event) => ({ id: event.id, type: event.type === 'PAYMENT_SUCCEEDED' ? 'PAYMENT_SUCCEEDED' as const : 'PAYMENT_FAILED' as const, occurredAt: event.occurredAt, subscriptionId: event.subscriptionId, amountMinor: event.amountMinor, currency: event.currency, subscriber: event.subscription?.telegramBotUser || null, plan: event.subscription?.plan || null })),
      ...recentSubscriptions.map((subscription) => ({ id: `subscription:${subscription.id}`, type: 'SUBSCRIPTION' as const, occurredAt: subscription.createdAt, subscriptionId: subscription.id, amountMinor: subscription.amountMinor, currency: subscription.currency, subscriber: subscription.telegramBotUser, plan: subscription.plan })),
    ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()).slice(0, 16);
    return { analytics: { ...analytics, conversionRate: registeredUsers ? analytics.paidUsers / registeredUsers : 0 }, aiUsage, recentActivity: recentActivity.map((item) => ({ ...item, occurredAt: item.occurredAt.toISOString() })) } satisfies BotBillingOverviewView;
  }

  async plans(userId: string, botIntegrationId: string) {
    const bot = await this.bot(userId, botIntegrationId);
    return this.prisma.botSubscriptionPlan.findMany({ where: { botIntegrationId, workspaceId: bot.workspaceId }, select: { id: true, code: true, name: true, description: true, isActive: true, createdAt: true, prices: { select: { id: true, currency: true, interval: true, amountMinor: true, version: true, isPublic: true, isActive: true }, orderBy: [{ currency: 'asc' }, { interval: 'asc' }, { version: 'desc' }] } }, orderBy: { createdAt: 'asc' } });
  }

  async coupons(userId: string, botIntegrationId: string) {
    const bot = await this.bot(userId, botIntegrationId);
    const rows = await this.prisma.botCoupon.findMany({ where: { botIntegrationId, workspaceId: bot.workspaceId }, select: { id: true, code: true, planId: true, percentOff: true, amountOffMinor: true, currency: true, startsAt: true, expiresAt: true, maxRedemptions: true, newUsersOnly: true, isActive: true, createdAt: true, plan: { select: { id: true, name: true } }, _count: { select: { redemptions: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map(({ _count, ...row }) => ({ ...row, redemptionCount: _count.redemptions }));
  }

  async subscribers(userId: string, botIntegrationId: string, query: BillingSubscribersQueryDto): Promise<BotBillingSubscriberPage> {
    const bot = await this.bot(userId, botIntegrationId);
    const limit = Math.min(query.limit || 25, 100);
    const where = {
      workspaceId: bot.workspaceId,
      botIntegrationId,
      ...(query.status ? { status: query.status as BotSubscriptionStatus } : {}),
      ...(query.source ? { source: query.source as BotSubscriptionSource } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.provider ? { providerSubscription: { is: { provider: query.provider as BotBillingProvider } } } : {}),
      ...((query.search?.trim() || query.environment) ? { telegramBotUser: { is: {
        ...(query.search?.trim() ? { OR: [{ username: { contains: query.search.trim(), mode: 'insensitive' as const } }, { firstName: { contains: query.search.trim(), mode: 'insensitive' as const } }, { telegramUserId: { contains: query.search.trim() } }] } : {}),
        ...(query.environment ? { runtimeInstance: { is: { environment: query.environment as TelegramBotRuntimeEnvironment } } } : {}),
      } } } : {}),
    };
    const rows = await this.prisma.botSubscription.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), select: { id: true, source: true, status: true, amountMinor: true, currency: true, interval: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, createdAt: true, telegramBotUser: { select: { id: true, telegramUserId: true, username: true, firstName: true } }, plan: { select: { id: true, name: true } }, providerSubscription: { select: { provider: true } } } });
    const page = rows.slice(0, limit);
    return { items: page.map((row) => ({ id: row.id, user: row.telegramBotUser, plan: row.plan, amountMinor: row.amountMinor, currency: row.currency, interval: row.interval, source: row.source, provider: row.providerSubscription?.provider || null, status: row.status, currentPeriodStart: row.currentPeriodStart?.toISOString() || null, currentPeriodEnd: row.currentPeriodEnd?.toISOString() || null, cancelAtPeriodEnd: row.cancelAtPeriodEnd, createdAt: row.createdAt.toISOString() })), nextCursor: rows.length > limit ? page.at(-1)?.id || null : null };
  }

  async users(userId: string, botIntegrationId: string, query: BillingUsersQueryDto): Promise<BotBillingUserPage> {
    const bot = await this.bot(userId, botIntegrationId);
    const limit = Math.min(query.limit || 25, 100);
    const rows = await this.prisma.telegramBotUser.findMany({
      where: {
        workspaceId: bot.workspaceId, botIntegrationId,
        runtimeInstance: { is: { environment: (query.environment || 'PRODUCTION') as TelegramBotRuntimeEnvironment } },
        ...(query.search?.trim() ? { OR: [{ username: { contains: query.search.trim(), mode: 'insensitive' } }, { firstName: { contains: query.search.trim(), mode: 'insensitive' } }, { lastName: { contains: query.search.trim(), mode: 'insensitive' } }, { telegramUserId: { contains: query.search.trim() } }] } : {}),
      },
      orderBy: [{ lastInteractionAt: 'desc' }, { id: 'desc' }], take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true, telegramUserId: true, username: true, firstName: true, lastName: true,
        languageCode: true, firstSeenAt: true, lastInteractionAt: true,
        runtimeInstance: { select: { environment: true } },
        financeProfiles: { where: { botIntegrationId }, take: 1, select: { id: true, locale: true, defaultCurrency: true, timezone: true, onboardingCompletedAt: true } },
        billingSubscriptions: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, source: true, currentPeriodEnd: true, plan: { select: { id: true, name: true, code: true } } } },
      },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map(({ financeProfiles, billingSubscriptions, runtimeInstance, ...row }) => ({
        ...row, environment: runtimeInstance!.environment,
        firstSeenAt: row.firstSeenAt.toISOString(), lastInteractionAt: row.lastInteractionAt.toISOString(),
        profile: financeProfiles[0] ? { id: financeProfiles[0].id, locale: supportLocale(financeProfiles[0].locale, row.languageCode), defaultCurrency: financeProfiles[0].defaultCurrency, timezone: financeProfiles[0].timezone, onboardingCompleted: Boolean(financeProfiles[0].onboardingCompletedAt) } : null,
        subscription: billingSubscriptions[0] ? { ...billingSubscriptions[0], currentPeriodEnd: billingSubscriptions[0].currentPeriodEnd?.toISOString() || null } : null,
      })),
      nextCursor: rows.length > limit ? page.at(-1)?.id || null : null,
    };
  }

  async updateFinanceSupportProfile(userId: string, botIntegrationId: string, telegramBotUserId: string, dto: UpdateFinanceSupportProfileDto) {
    const bot = await this.bot(userId, botIntegrationId);
    if (dto.timezone) try { Intl.DateTimeFormat('en', { timeZone: dto.timezone }).format(); } catch { throw new BadRequestException('Unknown timezone'); }
    const profile = await this.prisma.financeProfile.findFirst({ where: { botIntegrationId, telegramBotUserId, botIntegration: { workspaceId: bot.workspaceId } }, select: { id: true } });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const updated = await this.prisma.financeProfile.update({ where: { id: profile.id }, data: {
      ...(dto.locale ? { locale: dto.locale } : {}), ...(dto.currency ? { defaultCurrency: dto.currency.toUpperCase().slice(0, 3) } : {}),
      ...(dto.timezone ? { timezone: dto.timezone } : {}), ...(dto.resetOnboarding ? { onboardingCompletedAt: null } : {}),
    }, select: { id: true, locale: true, defaultCurrency: true, timezone: true, onboardingCompletedAt: true } });
    this.audit(bot.workspaceId, userId, 'finance.support_profile_updated', { botIntegrationId, telegramBotUserId, fields: Object.keys(dto) });
    return updated;
  }

  private audit(workspaceId: string, userId: string, event: string, metadata: Record<string, unknown>) {
    this.logger.info({ kind: 'audit', source: 'bot-billing', event, message: event, workspaceId, userId, metadata });
  }
}
