import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { FinanceStandaloneBillingCatalog } from '@telegram-system/shared';
import { FinanceBillingMode, FinanceBillingOffer, FinanceBillingStatus, Prisma } from '../generated/prisma';
import { FinancePrismaService } from '../prisma/finance-prisma.service';
import { FinanceRuntimeConfig } from '../config/finance-runtime-config';
import type { FinanceSession } from '../identity/finance-session.service';
import { FINANCE_PLUS_OFFERS, type FinancePlusOffer } from './finance-billing-catalog';
import { FinanceStripeService } from './finance-stripe.service';

@Injectable()
export class FinanceBillingService {
  constructor(private readonly prisma: FinancePrismaService, private readonly stripe: FinanceStripeService, private readonly config: FinanceRuntimeConfig) {}

  async catalog(session: FinanceSession): Promise<FinanceStandaloneBillingCatalog> {
    const now = new Date();
    const mode = this.config.stripeMode || 'LIVE';
    const [subscriptions, activeCandidates, history, introUsed] = await Promise.all([
      this.prisma.financeBillingSubscription.findMany({ where: { profileId: session.profileId, financeBotId: session.financeBotId, mode }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.financeBillingSubscription.findMany({ where: { profileId: session.profileId, financeBotId: session.financeBotId, mode, status: { in: ['ACTIVE', 'GIFT', 'CANCELED'] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] }, orderBy: { createdAt: 'desc' } }),
      this.prisma.financeBillingPayment.findMany({ where: { profileId: session.profileId, mode }, orderBy: { occurredAt: 'desc' }, take: 30 }),
      this.prisma.financeBillingSubscription.findFirst({ where: { profileId: session.profileId, mode, introUsed: true, OR: [{ payments: { some: { kind: 'PAYMENT_SUCCEEDED', confirmedCashMinor: { gt: 0 } } } }, { source: 'LEGACY' }] }, select: { id: true } }),
    ]);
    const cashFacts = activeCandidates.length
      ? await this.prisma.financeBillingPayment.groupBy({ by: ['subscriptionId', 'kind'], where: { profileId: session.profileId, mode, subscriptionId: { in: activeCandidates.map(candidate => candidate.id) }, kind: { in: ['PAYMENT_SUCCEEDED','REFUND','CHARGEBACK'] } }, _sum: { confirmedCashMinor: true } })
      : [];
    const cashBySubscription = new Map<string, number>();
    for (const fact of cashFacts) if (fact.subscriptionId) cashBySubscription.set(fact.subscriptionId, (cashBySubscription.get(fact.subscriptionId) || 0) + (fact.kind === 'PAYMENT_SUCCEEDED' ? 1 : -1) * (fact._sum.confirmedCashMinor || 0));
    const live = activeCandidates.find(s => (s.source === 'GIFT' || Boolean(s.currentPeriodEnd && s.currentPeriodEnd > now)) && (s.source !== 'STRIPE' || (cashBySubscription.get(s.id) || 0) > 0));
    const latest = live || subscriptions.find(s => ['ACTIVE', 'PAST_DUE', 'CANCELED'].includes(s.status)) || null;
    const hasPending = subscriptions.some(s => s.status === 'PENDING' && s.checkoutExpiresAt && s.checkoutExpiresAt > now);
    const usedIntro = Boolean(introUsed);
    const hasOpenSubscription = activeCandidates.length > 0;
    return {
      tier: live ? 'PLUS' : 'FREE',
      activeUntil: live?.currentPeriodEnd?.toISOString() || null,
      cancelAtPeriodEnd: live?.cancelAtPeriodEnd || false,
      offers: (Object.entries(FINANCE_PLUS_OFFERS) as Array<[FinancePlusOffer, typeof FINANCE_PLUS_OFFERS[FinancePlusOffer]]>).map(([code, offer]) => ({
        code, amountMinor: offer.amountMinor, currency: 'UAH' as const, intervalLabel: offer.intervalLabel,
        ...('introNextAmountMinor' in offer ? { introNextAmountMinor: offer.introNextAmountMinor } : {}),
        available: Boolean(this.config.stripeMode) && !hasOpenSubscription && !hasPending && !(code === 'INTRO' && usedIntro),
      })),
      subscription: latest ? {
        id: latest.id,
        status: latest.status === 'GIFT' ? 'ACTIVE' : latest.status === 'EXPIRED' || latest.status === 'PENDING' ? 'INCOMPLETE' : latest.status,
        source: latest.source === 'GIFT' ? 'GIFT' : latest.source === 'LEGACY' ? 'LEGACY' : 'STRIPE',
        offerCode: latest.offer,
        currentPeriodEnd: latest.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: latest.cancelAtPeriodEnd,
      } : null,
      history: history.filter(p => ['PAYMENT_SUCCEEDED','PAYMENT_FAILED','REFUND','CHARGEBACK'].includes(p.kind)).map(p => ({
        id: p.id, kind: p.kind as 'PAYMENT_SUCCEEDED'|'PAYMENT_FAILED'|'REFUND'|'CHARGEBACK', amountMinor: p.amountMinor,
        currency: p.currency, cashAmountMinor: p.confirmedCashMinor, bonusAmountMinor: p.internalBonusMinor, occurredAt: p.occurredAt.toISOString(),
      })),
    };
  }

  private async assertProfile(session: FinanceSession) {
    const profile = await this.prisma.financeProfile.findFirst({ where: { id: session.profileId, financeBotId: session.financeBotId, financeTelegramUserId: session.financeTelegramUserId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Finance profile not found');
  }

  async checkout(session: FinanceSession, offer: FinancePlusOffer) {
    await this.assertProfile(session);
    const mode = this.stripe.mode();
    if (!this.config.webPublicUrl) throw new ServiceUnavailableException('Finance web origin is not configured');
    const price = await this.prisma.financeBillingPrice.findFirst({ where: { mode, offer, isCurrent: true, amountMinor: FINANCE_PLUS_OFFERS[offer].amountMinor, stripePriceId: { not: null } }, orderBy: { version: 'desc' } });
    if (!price?.stripePriceId) throw new ServiceUnavailableException('Finance prices require billing:sync');
    const reservation = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.profileId}), hashtext('finance-billing-checkout'))`;
      const existing = await tx.financeBillingSubscription.findMany({ where: { profileId: session.profileId, financeBotId: session.financeBotId, mode }, select: { status: true, currentPeriodEnd: true, checkoutExpiresAt: true, introUsed: true } });
      const now = new Date();
      if (existing.some(s => (['ACTIVE','GIFT','CANCELED'].includes(s.status) && (!s.currentPeriodEnd || s.currentPeriodEnd > now)) || (s.status === 'PENDING' && s.checkoutExpiresAt && s.checkoutExpiresAt > now))) throw new ConflictException('Finance PLUS subscription or Checkout already exists');
      if (offer === 'INTRO' && await tx.financeBillingSubscription.findFirst({ where: { profileId: session.profileId, mode, introUsed: true, payments: { some: { kind: 'PAYMENT_SUCCEEDED', confirmedCashMinor: { gt: 0 } } } }, select: { id: true } })) throw new ConflictException('Introductory offer was already used');
      return tx.financeBillingSubscription.create({ data: { financeBotId: session.financeBotId, profileId: session.profileId, mode, offer, status: 'PENDING', priceId: price.id, introUsed: offer === 'INTRO', checkoutExpiresAt: new Date(now.getTime() + 32 * 60_000) } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    try {
      const client = this.stripe.client(mode);
      const prior = await this.prisma.financeBillingSubscription.findFirst({ where: { profileId: session.profileId, mode, stripeCustomerId: { not: null } }, orderBy: { createdAt: 'desc' }, select: { stripeCustomerId: true } });
      const customer = prior?.stripeCustomerId || (await client.customers.create({ metadata: { financeProfileId: session.profileId } }, { idempotencyKey: `finance-customer:${mode}:${session.profileId}` })).id;
      const returnBase = new URL(`/finance/${encodeURIComponent(session.financeBotId)}?screen=subscription`, this.config.webPublicUrl).toString();
      const checkout = await client.checkout.sessions.create({
        mode: 'subscription', customer, line_items: [{ price: price.stripePriceId, quantity: 1 }],
        expires_at: Math.floor(reservation.checkoutExpiresAt!.getTime() / 1000),
        success_url: `${returnBase}&checkout=success`, cancel_url: `${returnBase}&checkout=cancel`,
        client_reference_id: reservation.id, metadata: { financeSubscriptionId: reservation.id },
        subscription_data: { metadata: { financeSubscriptionId: reservation.id, financeProfileId: session.profileId }, description: offer === 'INTRO' ? '7 UAH for 3 days, then 179 UAH each month' : undefined },
      }, { idempotencyKey: `finance-checkout:${mode}:${reservation.id}` });
      if (!checkout.url) throw new Error('Stripe Checkout returned no URL');
      await this.prisma.financeBillingSubscription.update({ where: { id: reservation.id }, data: { stripeCustomerId: customer, stripeCheckoutId: checkout.id } });
      return { url: checkout.url };
    } catch {
      await this.prisma.financeBillingSubscription.update({ where: { id: reservation.id }, data: { status: 'EXPIRED' } });
      throw new ServiceUnavailableException('Finance Checkout is temporarily unavailable');
    }
  }

  async portal(session: FinanceSession) {
    await this.assertProfile(session);
    const mode = this.stripe.mode();
    const subscription = await this.prisma.financeBillingSubscription.findFirst({ where: { profileId: session.profileId, financeBotId: session.financeBotId, mode, source: 'STRIPE', stripeCustomerId: { not: null } }, orderBy: { createdAt: 'desc' } });
    if (!subscription?.stripeCustomerId) throw new NotFoundException('Stripe customer not found');
    if (!this.config.webPublicUrl) throw new ServiceUnavailableException('Finance web origin is not configured');
    const returnUrl = new URL(`/finance/${encodeURIComponent(session.financeBotId)}?screen=subscription`, this.config.webPublicUrl).toString();
    const result = await this.stripe.client(mode).billingPortal.sessions.create({ customer: subscription.stripeCustomerId, return_url: returnUrl });
    return { url: result.url };
  }

  async setCancel(session: FinanceSession, cancelAtPeriodEnd: boolean) {
    await this.assertProfile(session);
    const mode = this.stripe.mode();
    const subscription = await this.prisma.financeBillingSubscription.findFirst({ where: { profileId: session.profileId, financeBotId: session.financeBotId, mode, source: 'STRIPE', status: { in: ['ACTIVE','PAST_DUE'] }, stripeSubscriptionId: { not: null } }, orderBy: { createdAt: 'desc' } });
    if (!subscription?.stripeSubscriptionId) throw new NotFoundException('Active Stripe subscription not found');
    const result = await this.stripe.client(mode).subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: cancelAtPeriodEnd });
    await this.prisma.financeBillingSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: result.cancel_at_period_end } });
    return { cancelAtPeriodEnd: result.cancel_at_period_end };
  }
}
