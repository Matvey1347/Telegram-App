import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { Prisma } from '../generated/prisma';
import { FinancePrismaService } from '../prisma/finance-prisma.service';
import { FinanceStripeService } from './finance-stripe.service';

function idOf(value: unknown): string | null {
  return typeof value === 'string' ? value : value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : null;
}
function subscriptionIdOf(object: any): string | null {
  return idOf(object.subscription) || idOf(object.parent?.subscription_details?.subscription) || (typeof object.id === 'string' && object.id.startsWith('sub_') ? object.id : null);
}

@Injectable()
export class FinanceStripeWebhookService {
  constructor(private readonly prisma: FinancePrismaService, private readonly stripe: FinanceStripeService) {}

  async receive(mode: 'TEST' | 'LIVE', signature: string | undefined, rawBody: Buffer | undefined) {
    const event = this.stripe.webhook(mode, rawBody, signature);
    const object: any = event.data.object;
    const localId = object.metadata?.financeSubscriptionId || object.client_reference_id;
    let providerId = subscriptionIdOf(object);
    const client = this.stripe.client(mode);
    let subscription = localId ? await this.prisma.financeBillingSubscription.findUnique({ where: { id: localId } }) : null;
    if (!subscription && providerId) subscription = await this.prisma.financeBillingSubscription.findFirst({ where: { mode, stripeSubscriptionId: providerId } });
    let snapshot: Stripe.Subscription | null = providerId ? await client.subscriptions.retrieve(providerId) : null;
    if (!subscription && snapshot?.metadata?.financeSubscriptionId) subscription = await this.prisma.financeBillingSubscription.findUnique({ where: { id: snapshot.metadata.financeSubscriptionId } });
    if (!subscription && (event.type === 'refund.created' || event.type === 'refund.updated' || event.type === 'charge.dispute.created')) {
      const originalChargeId = idOf(object.charge) || idOf(object.payment_intent);
      const original = originalChargeId ? await this.prisma.financeBillingPayment.findFirst({ where: { mode, OR: [{ stripeChargeId: originalChargeId }, { stripePaymentIntentId: originalChargeId }] }, orderBy: { createdAt: 'desc' } }) : null;
      if (original?.subscriptionId) subscription = await this.prisma.financeBillingSubscription.findUnique({ where: { id: original.subscriptionId } });
      if (!subscription && idOf(object.charge)) {
        const charge = await client.charges.retrieve(idOf(object.charge)!);
        const invoiceId = idOf((charge as any).invoice);
        const payment = invoiceId ? await this.prisma.financeBillingPayment.findFirst({ where: { mode, stripeInvoiceId: invoiceId }, orderBy: { createdAt: 'desc' } }) : null;
        if (payment?.subscriptionId) subscription = await this.prisma.financeBillingSubscription.findUnique({ where: { id: payment.subscriptionId } });
      }
      providerId = subscription?.stripeSubscriptionId || null;
      if (providerId) snapshot = await client.subscriptions.retrieve(providerId);
    }
    if (!subscription && (event.type.startsWith('customer.subscription.') || event.type.startsWith('invoice.') || event.type === 'refund.created' || event.type === 'refund.updated' || event.type === 'charge.dispute.created')) throw new NotFoundException('Finance subscription for Stripe event not found');
    if (subscription && subscription.mode !== mode) throw new BadRequestException('Stripe subscription mode mismatch');
    if (subscription && idOf(object.customer) && subscription.stripeCustomerId && idOf(object.customer) !== subscription.stripeCustomerId) throw new BadRequestException('Stripe customer mismatch');
    const invoicePayments = subscription && event.type === 'invoice.paid'
      ? await client.invoicePayments.list({ invoice: object.id, status: 'paid', limit: 100 })
      : null;
    if (invoicePayments?.has_more) throw new BadRequestException('Finance invoice has too many payments to reconcile');
    const confirmedCashMinor = invoicePayments?.data.reduce((sum, payment) =>
      sum + (payment.payment.type === 'payment_intent' || payment.payment.type === 'charge' ? payment.amount_paid || 0 : 0), 0) || 0;
    let scheduleId: string | null = null;
    if (subscription?.offer === 'INTRO' && providerId && !subscription.stripeScheduleId && event.type === 'invoice.paid' && object.billing_reason === 'subscription_create' && object.paid_out_of_band !== true && confirmedCashMinor > 0) {
      const existingSchedule = idOf((snapshot as any)?.schedule);
      const intro = await this.prisma.financeBillingPrice.findUnique({ where: { id: subscription.priceId! } });
      const monthly = await this.prisma.financeBillingPrice.findFirst({ where: { mode, offer: 'MONTH', isCurrent: true, stripePriceId: { not: null } }, orderBy: { version: 'desc' } });
      const periodEnd = (snapshot as any)?.items?.data?.[0]?.current_period_end;
      if (!intro?.stripePriceId || !monthly?.stripePriceId || !periodEnd || (snapshot as any)?.items?.data?.[0]?.price?.id !== intro.stripePriceId) throw new BadRequestException('Intro phase cannot be scheduled');
      const schedule = existingSchedule
        ? await client.subscriptionSchedules.retrieve(existingSchedule)
        : await client.subscriptionSchedules.create({ from_subscription: providerId }, { idempotencyKey: `finance-intro-schedule:${mode}:${providerId}` });
      const alreadyScheduled = schedule.phases.some(phase => phase.items?.some(item => idOf(item.price) === monthly.stripePriceId));
      if (!alreadyScheduled) await client.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        proration_behavior: 'none',
        phases: [
          { items: [{ price: intro.stripePriceId, quantity: 1 }], start_date: schedule.phases[0].start_date, end_date: periodEnd, proration_behavior: 'none' },
          { items: [{ price: monthly.stripePriceId, quantity: 1 }], start_date: periodEnd, end_date: Math.floor(new Date(new Date(periodEnd * 1000).setUTCMonth(new Date(periodEnd * 1000).getUTCMonth() + 1)).getTime() / 1000), proration_behavior: 'none' },
        ],
      }, { idempotencyKey: `finance-intro-phases:${mode}:${providerId}` });
      scheduleId = schedule.id;
    }
    const invoiceId = event.type.startsWith('invoice.') ? object.id as string : null;
    const paymentIntentId = idOf(object.payment_intent) || idOf(object.parent?.payment_intent) || idOf(invoicePayments?.data.find(payment => payment.payment.type === 'payment_intent')?.payment.payment_intent);
    const chargeId = idOf(object.charge) || idOf(invoicePayments?.data.find(payment => payment.payment.type === 'charge')?.payment.charge) || (event.type.startsWith('charge.') ? object.id as string : null);
    const refundId = event.type === 'refund.created' || event.type === 'refund.updated' ? object.id as string : null;
    const disputeId = event.type === 'charge.dispute.created' ? object.id as string : null;
    const paymentKind = event.type === 'invoice.paid' ? 'PAYMENT_SUCCEEDED' : event.type === 'invoice.payment_failed' ? 'PAYMENT_FAILED' : refundId && object.status === 'succeeded' ? 'REFUND' : event.type === 'charge.dispute.created' ? 'CHARGEBACK' : null;
    const currentStripePriceId = idOf((snapshot as any)?.items?.data?.[0]?.price);
    const mappedPrice = subscription && currentStripePriceId && event.type.startsWith('customer.subscription.')
      ? await this.prisma.financeBillingPrice.findFirst({ where: { mode, stripePriceId: currentStripePriceId }, select: { id: true, offer: true } })
      : null;
    try {
      await this.prisma.$transaction(async tx => {
        await tx.financeBillingWebhookEvent.create({ data: { mode, stripeEventId: event.id, type: event.type } });
        if (!subscription) return;
        const current = await tx.financeBillingSubscription.findUniqueOrThrow({ where: { id: subscription.id } });
        const providerStatus = snapshot?.status;
        const period = (snapshot as any)?.items?.data?.[0];
        const nextStatus = providerStatus === 'active' ? 'ACTIVE' : providerStatus === 'past_due' || providerStatus === 'unpaid' ? 'PAST_DUE' : providerStatus === 'canceled' ? 'CANCELED' : 'PENDING';
        if (snapshot) {
          await tx.financeBillingSubscription.update({ where: { id: current.id }, data: {
            status: nextStatus, stripeSubscriptionId: snapshot.id, stripeCustomerId: idOf(snapshot.customer) || current.stripeCustomerId,
            stripeScheduleId: scheduleId || current.stripeScheduleId,
            ...(event.type.startsWith('customer.subscription.') ? { priceId: mappedPrice?.id || null, offer: mappedPrice?.offer || null } : {}),
            currentPeriodStart: period?.current_period_start ? new Date(period.current_period_start * 1000) : current.currentPeriodStart,
            currentPeriodEnd: period?.current_period_end ? new Date(period.current_period_end * 1000) : current.currentPeriodEnd,
            cancelAtPeriodEnd: snapshot.cancel_at_period_end,
          } });
        } else if (scheduleId) {
          await tx.financeBillingSubscription.update({ where: { id: current.id }, data: { stripeScheduleId: scheduleId } });
        }
        if (event.type === 'checkout.session.completed') await tx.financeBillingSubscription.update({ where: { id: current.id }, data: { stripeCheckoutId: object.id, stripeCustomerId: idOf(object.customer) || current.stripeCustomerId, stripeSubscriptionId: providerId || current.stripeSubscriptionId } });
        if (paymentKind) {
          const amount = paymentKind === 'PAYMENT_SUCCEEDED' ? Number(object.amount_paid || 0) : Number(object.amount || object.amount_due || 0);
          const currency = String(object.currency || 'uah').toUpperCase();
          const paymentData = { profileId: current.profileId, subscriptionId: current.id, mode, stripeEventId: event.id, stripeInvoiceId: invoiceId, stripePaymentIntentId: paymentIntentId, stripeChargeId: chargeId, stripeRefundId: refundId, stripeDisputeId: disputeId,
            kind: paymentKind, amountMinor: amount, currency, internalBonusMinor: 0, confirmedCashMinor: paymentKind === 'PAYMENT_SUCCEEDED' ? confirmedCashMinor : paymentKind === 'PAYMENT_FAILED' ? 0 : amount,
            occurredAt: new Date(event.created * 1000),
          };
          if (refundId) await tx.financeBillingPayment.upsert({ where: { mode_stripeRefundId: { mode, stripeRefundId: refundId } }, create: paymentData, update: {} });
          else if (invoiceId) await tx.financeBillingPayment.upsert({ where: { mode_stripeInvoiceId_kind: { mode, stripeInvoiceId: invoiceId, kind: paymentKind } }, create: paymentData, update: {} });
          else if (disputeId) await tx.financeBillingPayment.upsert({ where: { mode_stripeDisputeId: { mode, stripeDisputeId: disputeId } }, create: paymentData, update: {} });
          else await tx.financeBillingPayment.create({ data: paymentData });
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.financeBillingWebhookEvent.findUnique({ where: { mode_stripeEventId: { mode, stripeEventId: event.id } }, select: { id: true } });
        if (duplicate) return { received: true, duplicate: true };
      }
      throw error;
    }
    return { received: true, duplicate: false };
  }
}
