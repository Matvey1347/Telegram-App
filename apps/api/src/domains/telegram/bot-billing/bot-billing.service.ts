import { Logger } from '@nestjs/common';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BotBillingConnectionStatus,
  BotBillingInterval,
  BotBillingProvider,
  BotSubscriptionStatus,
  TelegramBotApplicationType,
  WorkspaceRole,
} from '@prisma/client';
import type {
  BotBillingSubscriberPage,
  BotBillingUserPage,
} from '@telegram-system/shared';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BILLING_PROVIDER_CAPABILITIES } from './bot-billing.providers';
import {
  BillingSubscribersQueryDto,
  BillingUsersQueryDto,
  CreateBillingGrantDto,
  CreateBillingPlanDto,
  CreateBillingPlanPriceDto,
  SetBillingPriceVisibilityDto,
  UpdateFinanceSupportProfileDto,
  UpsertBillingProviderConfigDto,
} from './dto';
import type { CreateBillingCouponDto } from './dto';
import { StripeBillingProvider } from './stripe-billing.provider';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { BotBillingAnalyticsService } from './bot-billing-analytics.service';
import { isProductionEnvironment } from '../../../config/deployment-config';
import { BotBillingProviderSettings } from './bot-billing-provider-settings';
import { reconcileFixedBillingCatalog } from './fixed-billing-catalog';
import { BotBillingCheckout } from './bot-billing-checkout';
import { BotBillingReadModels } from './bot-billing-read-models';

type Provider = BotBillingProvider;
type Mode = 'TEST' | 'LIVE';

export type FixedBillingCatalogDefinition = {
  code: string;
  name: string;
  amountMinor: number;
  currency: string;
  interval: BotBillingInterval;
  intervalCount: number;
};

@Injectable()
export class BotBillingService {
  private readonly catalogLogger = new Logger(BotBillingService.name);
  private catalogRefresh?: (
    botId?: string,
    workspaceId?: string,
  ) => Promise<void>;

  registerCatalogRefresh(
    refresh: (botId?: string, workspaceId?: string) => Promise<void>,
  ) {
    this.catalogRefresh = refresh;
  }

  private refreshCatalogAfterConfig(botId?: string, workspaceId?: string) {
    void this.catalogRefresh?.(botId, workspaceId).catch(() =>
      this.catalogLogger.warn('Could not refresh Finance Stripe catalog'),
    );
  }

  private readonly providerSettings: BotBillingProviderSettings;
  private readonly checkout: BotBillingCheckout;
  private readonly readModels: BotBillingReadModels;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly encryption: TokenEncryptionService,
    private readonly logger: ApplicationLoggerService,
    private readonly stripe: StripeBillingProvider,
    private readonly botApi: TelegramBotApiClient,
    private readonly analytics: BotBillingAnalyticsService,
  ) {
    this.providerSettings = new BotBillingProviderSettings(
      prisma,
      encryption,
      stripe,
      this.admin.bind(this),
      this.bot.bind(this),
      this.audit.bind(this),
    );
    this.checkout = new BotBillingCheckout(
      prisma,
      encryption,
      stripe,
      botApi,
      this.bot.bind(this),
    );
    this.readModels = new BotBillingReadModels(
      prisma,
      analytics,
      this.bot.bind(this),
    );
  }

  private async admin(userId: string) {
    return this.workspace.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
  }

  private async bot(userId: string, botIntegrationId: string) {
    const membership = await this.admin(userId);
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: { id: botIntegrationId, workspaceId: membership.workspaceId },
      select: { id: true, workspaceId: true },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    return bot;
  }

  private async rejectFinanceCatalogMutation(botIntegrationId: string) {
    const finance = await this.prisma.telegramBotIntegration.findFirst({
      where: { id: botIntegrationId, applicationType: 'FINANCE' },
      select: { id: true },
    });
    if (finance)
      throw new BadRequestException(
        'Finance uses its fixed Free and PLUS offers; synchronize canonical plans instead',
      );
  }

  providerResolution(userId: string, botIntegrationId: string) {
    return this.providerSettings.providerResolution(userId, botIntegrationId);
  }

  workspaceProviderResolution(userId: string) {
    return this.providerSettings.workspaceProviderResolution(userId);
  }

  removeWorkspaceProviderDefault(
    userId: string,
    provider: Provider,
    mode: Mode,
  ) {
    return this.providerSettings.removeWorkspaceProviderDefault(
      userId,
      provider,
      mode,
    );
  }

  async saveProviderConfig(
    userId: string,
    input: {
      botIntegrationId?: string;
      provider: Provider;
      mode: Mode;
      dto: UpsertBillingProviderConfigDto;
    },
  ) {
    const result = await this.providerSettings.saveProviderConfig(
      userId,
      input,
    );
    if (input.provider === 'STRIPE' && result.status === 'CONNECTED') {
      const membership = await this.admin(userId);
      this.refreshCatalogAfterConfig(
        input.botIntegrationId,
        membership.workspaceId,
      );
    }
    return result;
  }

  async useWorkspaceProviderDefault(
    userId: string,
    botIntegrationId: string,
    provider: Provider,
    mode: Mode,
  ) {
    const result = await this.providerSettings.useWorkspaceProviderDefault(
      userId,
      botIntegrationId,
      provider,
      mode,
    );
    if (provider === 'STRIPE') this.refreshCatalogAfterConfig(botIntegrationId);
    return result;
  }

  async createPlan(
    userId: string,
    botIntegrationId: string,
    dto: CreateBillingPlanDto,
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    await this.rejectFinanceCatalogMutation(botIntegrationId);
    return this.prisma.botSubscriptionPlan.create({
      data: {
        workspaceId: bot.workspaceId,
        botIntegrationId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
      },
    });
  }

  async addPrice(
    userId: string,
    botIntegrationId: string,
    planId: string,
    dto: CreateBillingPlanPriceDto,
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    await this.rejectFinanceCatalogMutation(botIntegrationId);
    const plan = await this.prisma.botSubscriptionPlan.findFirst({
      where: { id: planId, botIntegrationId, workspaceId: bot.workspaceId },
    });
    if (!plan) throw new NotFoundException('Billing plan not found');
    const currency = dto.currency.toUpperCase();
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.botPlanPrice.aggregate({
        where: {
          planId,
          currency,
          interval: dto.interval,
          intervalCount: dto.intervalCount || 1,
        },
        _max: { version: true },
      });
      // A replacement is a new immutable version. Existing subscribers keep their price row/snapshot.
      await tx.botPlanPrice.updateMany({
        where: {
          planId,
          currency,
          interval: dto.interval,
          intervalCount: dto.intervalCount || 1,
          isPublic: true,
        },
        data: { isPublic: false },
      });
      return tx.botPlanPrice.create({
        data: {
          planId,
          currency,
          interval: dto.interval,
          intervalCount: dto.intervalCount || 1,
          amountMinor: dto.amountMinor,
          version: (latest._max.version || 0) + 1,
        },
      });
    });
  }

  async setPriceVisibility(
    userId: string,
    botIntegrationId: string,
    priceId: string,
    dto: SetBillingPriceVisibilityDto,
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    await this.rejectFinanceCatalogMutation(botIntegrationId);
    const price = await this.prisma.botPlanPrice.findFirst({
      where: {
        id: priceId,
        plan: { botIntegrationId, workspaceId: bot.workspaceId },
      },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!price) throw new NotFoundException('Plan price not found');
    // Amount, currency, interval and version deliberately never appear in this update.
    return this.prisma.botPlanPrice.update({
      where: { id: priceId },
      data: {
        isPublic: dto.isPublic,
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
      },
    });
  }

  async grant(
    userId: string,
    botIntegrationId: string,
    dto: CreateBillingGrantDto,
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    const [subscriber, plan] = await Promise.all([
      this.prisma.telegramBotUser.findFirst({
        where: {
          id: dto.telegramBotUserId,
          botIntegrationId,
          workspaceId: bot.workspaceId,
        },
      }),
      this.prisma.botSubscriptionPlan.findFirst({
        where: {
          id: dto.planId,
          botIntegrationId,
          workspaceId: bot.workspaceId,
        },
      }),
    ]);
    if (!subscriber || !plan)
      throw new NotFoundException('Subscriber or plan not found');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date())
      throw new BadRequestException('Grant expiry must be in the future');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.botSubscriptionGrant.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { subscription: true },
      });
      if (existing) {
        if (
          existing.subscription.workspaceId !== bot.workspaceId ||
          existing.subscription.botIntegrationId !== botIntegrationId ||
          existing.subscription.telegramBotUserId !== subscriber.id
        ) {
          throw new BadRequestException(
            'Idempotency key is already used by another billing operation',
          );
        }
        return existing.subscription;
      }
      const subscription = await tx.botSubscription.create({
        data: {
          workspaceId: bot.workspaceId,
          botIntegrationId,
          telegramBotUserId: subscriber.id,
          planId: plan.id,
          source: dto.source,
          status: BotSubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(),
          currentPeriodEnd: expiresAt,
        },
      });
      await tx.botSubscriptionGrant.create({
        data: {
          subscriptionId: subscription.id,
          source: dto.source,
          reason: dto.reason.trim(),
          idempotencyKey: dto.idempotencyKey,
          expiresAt,
          createdByUserId: userId,
        },
      });
      await tx.botBillingEvent.create({
        data: {
          workspaceId: bot.workspaceId,
          botIntegrationId,
          subscriptionId: subscription.id,
          type: 'GRANT_CREATED',
        },
      });
      return subscription;
    });
  }

  async catalog(botIntegrationId: string, telegramBotUserId: string) {
    const bot = await this.prisma.telegramBotIntegration.findUnique({
      where: { id: botIntegrationId },
      select: { workspaceId: true },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const [plans, entitlement, providers] = await Promise.all([
      this.prisma.botSubscriptionPlan.findMany({
        where: { botIntegrationId, isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          prices: {
            where: { isActive: true, isPublic: true },
            orderBy: [
              { currency: 'asc' },
              { interval: 'asc' },
              { intervalCount: 'asc' },
              { version: 'desc' },
            ],
          },
        },
      }),
      this.prisma.botSubscription.findMany({
        where: { botIntegrationId, telegramBotUserId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          source: true,
          status: true,
          currency: true,
          interval: true,
          intervalCount: true,
          amountMinor: true,
          priceVersion: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      }),
      this.prisma.botBillingProviderConfig.findMany({
        where: {
          workspaceId: bot.workspaceId,
          OR: [{ botIntegrationId }, { botIntegrationId: null }],
        },
        select: {
          provider: true,
          mode: true,
          botIntegrationId: true,
          connectionStatus: true,
        },
      }),
    ]);
    const resolvedProviders = new Map<string, (typeof providers)[number]>();
    for (const item of providers) {
      const key = `${item.provider}:${item.mode}`;
      if (
        !resolvedProviders.has(key) ||
        item.botIntegrationId === botIntegrationId
      )
        resolvedProviders.set(key, item);
    }
    const available = [...resolvedProviders.values()]
      .filter(
        (item) =>
          item.connectionStatus === BotBillingConnectionStatus.CONNECTED,
      )
      .filter((item) => item.mode === 'LIVE' || !isProductionEnvironment())
      .map((item) => ({
        provider: item.provider,
        mode: item.mode,
        capabilities: BILLING_PROVIDER_CAPABILITIES[item.provider],
      }));
    return { plans, subscriptions: entitlement, providers: available };
  }

  createStripeCheckout(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    priceId: string;
    requestedMode?: Mode;
    preventOverlap?: boolean;
    couponCode?: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    return this.checkout.createStripeCheckout(input);
  }

  async syncFixedCatalog(
    userId: string,
    botIntegrationId: string,
    applicationType: TelegramBotApplicationType,
    definitions: readonly FixedBillingCatalogDefinition[],
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    return this.reconcileFixedCatalog(bot, applicationType, definitions, true);
  }

  async reconcileFixedCatalog(
    bot: { id: string; workspaceId: string },
    applicationType: TelegramBotApplicationType,
    definitions: readonly FixedBillingCatalogDefinition[],
    strict = false,
  ) {
    return reconcileFixedBillingCatalog(
      this.prisma,
      this.stripe,
      this.catalogLogger,
      bot,
      applicationType,
      definitions,
      strict,
    );
  }

  syncCouponToStripe(
    userId: string,
    botIntegrationId: string,
    couponId: string,
    mode: Mode = 'LIVE',
  ) {
    return this.checkout.syncCouponToStripe(
      userId,
      botIntegrationId,
      couponId,
      mode,
    );
  }

  setStripeAutoRenewal(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    cancelAtPeriodEnd: boolean;
    subscriptionId?: string;
  }) {
    return this.checkout.setStripeAutoRenewal(input);
  }

  changeStripePlan(
    input: Parameters<BotBillingCheckout['changeStripePlan']>[0],
  ) {
    return this.checkout.changeStripePlan(input);
  }

  stripeRenewal(input: Parameters<BotBillingCheckout['stripeRenewal']>[0]) {
    return this.checkout.stripeRenewal(input);
  }

  stripePortal(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    returnUrl: string;
  }) {
    return this.checkout.stripePortal(input);
  }

  createStarsCheckout(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    priceId: string;
  }) {
    return this.checkout.createStarsCheckout(input);
  }

  validateStarsPreCheckout(input: {
    botIntegrationId: string;
    telegramBotUserId: string;
    payload?: string;
    currency?: string;
    totalAmount?: number;
  }) {
    return this.checkout.validateStarsPreCheckout(input);
  }

  processStarsPayment(input: {
    botIntegrationId: string;
    runtimeInstanceId?: string;
    telegramBotUserId: string;
    payment: {
      invoice_payload?: string;
      currency?: string;
      total_amount?: number;
      telegram_payment_charge_id?: string;
      subscription_expiration_date?: number;
    };
  }) {
    return this.checkout.processStarsPayment(input);
  }

  async revokeGrant(
    userId: string,
    botIntegrationId: string,
    grantId: string,
    reason: string,
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    const grant = await this.prisma.botSubscriptionGrant.findFirst({
      where: {
        id: grantId,
        subscription: { botIntegrationId, workspaceId: bot.workspaceId },
      },
      include: { subscription: true },
    });
    if (!grant) throw new NotFoundException('Billing grant not found');
    if (grant.revokedAt) return grant;
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.botSubscriptionGrant.update({
        where: { id: grant.id },
        data: {
          revokedAt: new Date(),
          reason: `${grant.reason}\nRevoked: ${reason.trim()}`,
        },
      });
      await tx.botBillingEvent.create({
        data: {
          workspaceId: bot.workspaceId,
          botIntegrationId,
          subscriptionId: grant.subscriptionId,
          type: 'GRANT_REVOKED',
          payload: { reason: reason.trim() },
        },
      });
      return revoked;
    });
  }

  async createCoupon(
    userId: string,
    botIntegrationId: string,
    dto: CreateBillingCouponDto,
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    if (Boolean(dto.percentOff) === Boolean(dto.amountOffMinor))
      throw new BadRequestException('Choose exactly one coupon discount type');
    if (dto.amountOffMinor && !dto.currency)
      throw new BadRequestException(
        'Fixed coupons require an explicit currency',
      );
    if (
      dto.planId &&
      !(await this.prisma.botSubscriptionPlan.findFirst({
        where: {
          id: dto.planId,
          botIntegrationId,
          workspaceId: bot.workspaceId,
        },
      }))
    )
      throw new NotFoundException('Billing plan not found');
    const coupon = await this.prisma.botCoupon.create({
      data: {
        workspaceId: bot.workspaceId,
        botIntegrationId,
        planId: dto.planId || null,
        code: dto.code.trim().toUpperCase(),
        percentOff: dto.percentOff || null,
        amountOffMinor: dto.amountOffMinor || null,
        currency: dto.currency?.toUpperCase() || null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        maxRedemptions: dto.maxRedemptions || null,
        newUsersOnly: Boolean(dto.newUsersOnly),
      },
    });
    const finance = await this.prisma.telegramBotIntegration.findFirst({
      where: { id: botIntegrationId, applicationType: 'FINANCE' },
      select: { id: true },
    });
    if (!finance) return coupon;
    try {
      return await this.syncCouponToStripe(userId, botIntegrationId, coupon.id);
    } catch (error) {
      await this.prisma.botCoupon.delete({ where: { id: coupon.id } });
      throw error;
    }
  }

  overview(
    userId: string,
    botIntegrationId: string,
    environment: 'LOCAL' | 'PRODUCTION' = 'PRODUCTION',
  ) {
    return this.readModels.overview(userId, botIntegrationId, environment);
  }

  plans(userId: string, botIntegrationId: string) {
    return this.readModels.plans(userId, botIntegrationId);
  }

  coupons(userId: string, botIntegrationId: string) {
    return this.readModels.coupons(userId, botIntegrationId);
  }

  subscribers(
    userId: string,
    botIntegrationId: string,
    query: BillingSubscribersQueryDto,
  ): Promise<BotBillingSubscriberPage> {
    return this.readModels.subscribers(userId, botIntegrationId, query);
  }

  users(
    userId: string,
    botIntegrationId: string,
    query: BillingUsersQueryDto,
  ): Promise<BotBillingUserPage> {
    return this.readModels.users(userId, botIntegrationId, query);
  }

  async updateFinanceSupportProfile(
    userId: string,
    botIntegrationId: string,
    telegramBotUserId: string,
    dto: UpdateFinanceSupportProfileDto,
  ) {
    const bot = await this.bot(userId, botIntegrationId);
    if (dto.timezone)
      try {
        Intl.DateTimeFormat('en', { timeZone: dto.timezone }).format();
      } catch {
        throw new BadRequestException('Unknown timezone');
      }
    const profile = await this.prisma.financeProfile.findFirst({
      where: {
        botIntegrationId,
        telegramBotUserId,
        botIntegration: { workspaceId: bot.workspaceId },
      },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const updated = await this.prisma.financeProfile.update({
      where: { id: profile.id },
      data: {
        ...(dto.locale ? { locale: dto.locale } : {}),
        ...(dto.currency
          ? { defaultCurrency: dto.currency.toUpperCase().slice(0, 3) }
          : {}),
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
        ...(dto.resetOnboarding ? { onboardingCompletedAt: null } : {}),
      },
      select: {
        id: true,
        locale: true,
        defaultCurrency: true,
        timezone: true,
        onboardingCompletedAt: true,
      },
    });
    this.audit(bot.workspaceId, userId, 'finance.support_profile_updated', {
      botIntegrationId,
      telegramBotUserId,
      fields: Object.keys(dto),
    });
    return updated;
  }

  private audit(
    workspaceId: string,
    userId: string,
    event: string,
    metadata: Record<string, unknown>,
  ) {
    this.logger.info({
      kind: 'audit',
      source: 'bot-billing',
      event,
      message: event,
      workspaceId,
      userId,
      metadata,
    });
  }
}
