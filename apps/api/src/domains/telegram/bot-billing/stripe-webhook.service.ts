import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BotBillingProvider, BotSubscriptionStatus, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { PrismaService } from '../../../prisma/prisma.service';

type StripeObject = Stripe.Event.Data.Object & {
  id?: string;
  status?: string;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
  metadata?: Record<string, string>;
  client_reference_id?: string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  amount_paid?: number;
  currency?: string;
  parent?: { subscription_details?: { subscription?: string | { id: string } | null } } | null;
  items?: { data?: Array<{ current_period_start?: number; current_period_end?: number }> };
};

@Injectable()
export class StripeWebhookService {
  constructor(private readonly prisma: PrismaService, private readonly encryption: TokenEncryptionService) {}

  async receive(configId: string, signature: string | undefined, rawBody: Buffer | undefined) {
    if (!signature || !rawBody) throw new BadRequestException('Missing Stripe signature or raw body');
    const config = await this.prisma.botBillingProviderConfig.findFirst({ where: { id: configId, provider: BotBillingProvider.STRIPE } });
    if (!config?.webhookSecretEncrypted || !config.webhookSecretIv || !config.webhookSecretAuthTag) throw new NotFoundException('Stripe webhook endpoint is not configured');
    const webhookSecret = this.encryption.decrypt({ encrypted: config.webhookSecretEncrypted, iv: config.webhookSecretIv, authTag: config.webhookSecretAuthTag });
    const apiKey = config.secretKeyEncrypted && config.secretKeyIv && config.secretKeyAuthTag ? this.encryption.decrypt({ encrypted: config.secretKeyEncrypted, iv: config.secretKeyIv, authTag: config.secretKeyAuthTag }) : 'webhook-signature-verifier';
    let event: Stripe.Event;
    try { event = new Stripe(apiKey).webhooks.constructEvent(rawBody, signature, webhookSecret); }
    catch { throw new BadRequestException('Invalid Stripe webhook signature'); }
    const object = event.data.object as StripeObject;
    const localSubscriptionId = this.localSubscriptionId(object);
    const providerSubscriptionId = this.providerSubscriptionId(object);
    const local = localSubscriptionId
      ? await this.prisma.botSubscription.findUnique({ where: { id: localSubscriptionId } })
      : providerSubscriptionId
        ? await this.prisma.botSubscription.findFirst({ where: { OR: [{ providerSubscriptionId }, { providerSubscription: { providerSubscriptionId } }] } })
        : null;
    const botIntegrationId = config.botIntegrationId || local?.botIntegrationId || object.metadata?.botIntegrationId;
    if (!botIntegrationId) throw new BadRequestException('Stripe event has no billing bot context');
    const bot = await this.prisma.telegramBotIntegration.findFirst({ where: { id: botIntegrationId, workspaceId: config.workspaceId }, select: { id: true } });
    if (!bot || (local && local.botIntegrationId !== bot.id)) throw new BadRequestException('Stripe event billing context is invalid');
    const existing = await this.prisma.botBillingEvent.findFirst({ where: { provider: BotBillingProvider.STRIPE, mode: config.mode, providerEventId: event.id }, select: { id: true } });
    if (existing) return { received: true, duplicate: true };

    await this.prisma.$transaction(async (tx) => {
      const subscription = localSubscriptionId ? await tx.botSubscription.findFirst({ where: { id: localSubscriptionId, botIntegrationId, workspaceId: config.workspaceId } }) : providerSubscriptionId ? await tx.botSubscription.findFirst({ where: { botIntegrationId, workspaceId: config.workspaceId, OR: [{ providerSubscriptionId }, { providerSubscription: { providerSubscriptionId } }] } }) : null;
      await tx.botBillingEvent.create({ data: { workspaceId: config.workspaceId, botIntegrationId, subscriptionId: subscription?.id || null, provider: BotBillingProvider.STRIPE, mode: config.mode, providerEventId: event.id, type: this.eventType(event.type), amountMinor: object.amount_paid ?? null, currency: object.currency?.toUpperCase() || null, occurredAt: new Date(event.created * 1000), payload: { type: event.type, objectId: object.id || null, providerSubscriptionId } } });
      if (!subscription) return;
      const customerId = this.idOf(object.customer);
      if (event.type === 'checkout.session.completed') {
        if (!providerSubscriptionId) throw new BadRequestException('Stripe Checkout has no subscription');
        await tx.botSubscription.update({ where: { id: subscription.id }, data: { providerCustomerId: customerId || subscription.providerCustomerId, providerSubscriptionId } });
        await tx.botProviderSubscription.upsert({ where: { subscriptionId: subscription.id }, update: { providerSubscriptionId, providerStatus: object.status || 'checkout_complete', lastSyncedAt: new Date() }, create: { subscriptionId: subscription.id, provider: BotBillingProvider.STRIPE, mode: config.mode, providerSubscriptionId, providerStatus: object.status || 'checkout_complete' } });
      }
      if (event.type.startsWith('customer.subscription.')) {
        const status = this.status(object.status);
        const period = object.items?.data?.[0];
        await tx.botSubscription.update({ where: { id: subscription.id }, data: { status, providerSubscriptionId: providerSubscriptionId || subscription.providerSubscriptionId, providerCustomerId: customerId || subscription.providerCustomerId, currentPeriodStart: period?.current_period_start ? new Date(period.current_period_start * 1000) : subscription.currentPeriodStart, currentPeriodEnd: period?.current_period_end ? new Date(period.current_period_end * 1000) : subscription.currentPeriodEnd, cancelAtPeriodEnd: Boolean(object.cancel_at_period_end), canceledAt: object.canceled_at ? new Date(object.canceled_at * 1000) : subscription.canceledAt } });
        if (providerSubscriptionId) await tx.botProviderSubscription.upsert({ where: { subscriptionId: subscription.id }, update: { providerStatus: object.status || 'unknown', rawSnapshot: { status: object.status || null, cancelAtPeriodEnd: Boolean(object.cancel_at_period_end) }, lastSyncedAt: new Date() }, create: { subscriptionId: subscription.id, provider: BotBillingProvider.STRIPE, mode: config.mode, providerSubscriptionId, providerStatus: object.status || 'unknown', rawSnapshot: { status: object.status || null } } });
      }
      if (event.type === 'invoice.paid') await tx.botSubscription.update({ where: { id: subscription.id }, data: { status: BotSubscriptionStatus.ACTIVE } });
      if (event.type === 'invoice.payment_failed') await tx.botSubscription.update({ where: { id: subscription.id }, data: { status: BotSubscriptionStatus.PAST_DUE } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { received: true, duplicate: false };
  }

  private localSubscriptionId(object: StripeObject) { return object.metadata?.subscriptionId || object.client_reference_id || null; }
  private providerSubscriptionId(object: StripeObject) { return this.idOf(object.subscription) || this.idOf(object.parent?.subscription_details?.subscription) || (object.id?.startsWith('sub_') ? object.id : null); }
  private idOf(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id || null; }
  private status(status?: string) { if (status === 'active' || status === 'trialing') return BotSubscriptionStatus.ACTIVE; if (status === 'past_due' || status === 'unpaid') return BotSubscriptionStatus.PAST_DUE; if (status === 'canceled') return BotSubscriptionStatus.CANCELED; return BotSubscriptionStatus.INCOMPLETE; }
  private eventType(type: string) { if (type === 'checkout.session.completed') return 'CHECKOUT_COMPLETED' as const; if (type === 'invoice.paid') return 'PAYMENT_SUCCEEDED' as const; if (type === 'invoice.payment_failed') return 'PAYMENT_FAILED' as const; if (type === 'customer.subscription.deleted') return 'SUBSCRIPTION_CANCELED' as const; return 'SUBSCRIPTION_UPDATED' as const; }
}
