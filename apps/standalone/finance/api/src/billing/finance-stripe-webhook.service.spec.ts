import { FinanceStripeWebhookService } from './finance-stripe-webhook.service';

function setup(type: string, object: Record<string, unknown>, options: { eventId?: string; payments?: Array<Record<string, unknown>>; subscription?: Record<string, unknown> } = {}) {
  const subscription = {
    id: 'local-subscription', mode: 'TEST', offer: 'MONTH', priceId: 'local-price',
    profileId: 'profile', financeBotId: 'bot', stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123', stripeScheduleId: null,
    currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
    ...options.subscription,
  };
  const snapshot = {
    id: 'sub_123', status: 'active', customer: 'cus_123', cancel_at_period_end: false,
    items: { data: [{ current_period_start: 1_800_000_000, current_period_end: 1_802_592_000, price: { id: 'price_month' } }] },
    metadata: { financeSubscriptionId: 'local-subscription' }, schedule: null,
  };
  const tx = {
    financeBillingWebhookEvent: { create: jest.fn().mockResolvedValue({}) },
    financeBillingSubscription: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(subscription),
      update: jest.fn().mockResolvedValue({}),
    },
    financeBillingPayment: { create: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    financeBillingSubscription: {
      findUnique: jest.fn().mockResolvedValue(subscription),
      findFirst: jest.fn().mockResolvedValue(subscription),
    },
    financeBillingPayment: { findFirst: jest.fn().mockResolvedValue({ subscriptionId: 'local-subscription' }) },
    financeBillingPrice: {
      findUnique: jest.fn().mockResolvedValue({ stripePriceId: 'price_intro' }),
      findFirst: jest.fn().mockResolvedValue({ stripePriceId: 'price_month' }),
    },
    financeBillingWebhookEvent: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(tx)),
  };
  const client = {
    subscriptions: { retrieve: jest.fn().mockResolvedValue(snapshot) },
    subscriptionSchedules: {
      create: jest.fn().mockResolvedValue({ id: 'sched_123', phases: [{ start_date: 1_800_000_000 }] }),
      retrieve: jest.fn(), update: jest.fn().mockResolvedValue({}),
    },
    invoicePayments: { list: jest.fn().mockResolvedValue({ data: options.payments || [], has_more: false }) },
    charges: { retrieve: jest.fn() },
  };
  const event = { id: options.eventId || 'evt_123', type, created: 1_800_000_000, data: { object: { id: 'in_123', subscription: 'sub_123', customer: 'cus_123', currency: 'uah', ...object } } };
  const stripe = { webhook: jest.fn().mockReturnValue(event), client: jest.fn().mockReturnValue(client) };
  return { service: new FinanceStripeWebhookService(prisma as any, stripe as any), prisma, tx, client, stripe, snapshot };
}

describe('Finance Stripe webhook reconciliation', () => {
  it('does not treat invoice balance credits as confirmed cash', async () => {
    const { service, tx } = setup('invoice.paid', { amount_paid: 17900, billing_reason: 'subscription_cycle' });
    await service.receive('TEST', 'signed', Buffer.from('{}'));
    expect(tx.financeBillingPayment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ amountMinor: 17900, confirmedCashMinor: 0 }),
    }));
  });

  it('uses a successful invoice payment as cash and keys facts by invoice', async () => {
    const { service, tx } = setup('invoice.paid', { amount_paid: 17900, billing_reason: 'subscription_cycle' }, {
      payments: [{ amount_paid: 17900, payment: { type: 'payment_intent', payment_intent: 'pi_123' } }],
    });
    await service.receive('TEST', 'signed', Buffer.from('{}'));
    expect(tx.financeBillingPayment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { mode_stripeInvoiceId_kind: { mode: 'TEST', stripeInvoiceId: 'in_123', kind: 'PAYMENT_SUCCEEDED' } },
      create: expect.objectContaining({ confirmedCashMinor: 17900, stripePaymentIntentId: 'pi_123' }),
    }));
  });

  it('waits for a refund to succeed and deduplicates by refund ID', async () => {
    const { service, tx, stripe } = setup('refund.created', { id: 're_123', charge: 'ch_123', amount: 17900, status: 'pending' });
    await service.receive('TEST', 'signed', Buffer.from('{}'));
    expect(tx.financeBillingPayment.upsert).not.toHaveBeenCalled();
    stripe.webhook.mockReturnValue({ id: 'evt_refund_succeeded', type: 'refund.updated', created: 1_800_000_001, data: { object: { id: 're_123', charge: 'ch_123', amount: 17900, status: 'succeeded', currency: 'uah' } } });
    await service.receive('TEST', 'signed', Buffer.from('{}'));
    expect(tx.financeBillingPayment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { mode_stripeRefundId: { mode: 'TEST', stripeRefundId: 're_123' } },
    }));
  });

  it('does not recreate an introductory schedule from a later renewal invoice', async () => {
    const { service, client } = setup('invoice.paid', { amount_paid: 700, billing_reason: 'subscription_cycle' }, {
      subscription: { offer: 'INTRO' },
      payments: [{ amount_paid: 700, payment: { type: 'payment_intent', payment_intent: 'pi_intro' } }],
    });
    await service.receive('TEST', 'signed', Buffer.from('{}'));
    expect(client.subscriptionSchedules.create).not.toHaveBeenCalled();
  });

  it('configures a paid intro to the monthly phase after the initial invoice', async () => {
    const { service, client, snapshot } = setup('invoice.paid', { amount_paid: 700, billing_reason: 'subscription_create' }, {
      subscription: { offer: 'INTRO' },
      payments: [{ amount_paid: 700, payment: { type: 'payment_intent', payment_intent: 'pi_intro' } }],
    });
    snapshot.items.data[0].price.id = 'price_intro';
    await service.receive('TEST', 'signed', Buffer.from('{}'));
    expect(client.subscriptionSchedules.create).toHaveBeenCalledWith({ from_subscription: 'sub_123' }, expect.anything());
    expect(client.subscriptionSchedules.update).toHaveBeenCalledWith('sched_123', expect.objectContaining({
      end_behavior: 'release', phases: expect.arrayContaining([expect.objectContaining({ items: [{ price: 'price_month', quantity: 1 }] })]),
    }), expect.anything());
  });

  it('tracks the monthly billing period after Stripe changes the subscription price', async () => {
    const { service, prisma, tx } = setup('customer.subscription.updated', { id: 'sub_123', status: 'active' }, {
      subscription: { offer: 'INTRO', introUsed: true },
    });
    prisma.financeBillingPrice.findFirst.mockResolvedValue({ id: 'local-month-price', offer: 'MONTH' });
    await service.receive('TEST', 'signed', Buffer.from('{}'));
    expect(tx.financeBillingSubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ priceId: 'local-month-price', offer: 'MONTH' }),
    }));
  });

  it('keeps recovered access when an older payment-failed event arrives last', async () => {
    const { service, tx } = setup('invoice.payment_failed', { amount_due: 17900 });
    await service.receive('TEST', 'signed', Buffer.from('{}'));
    expect(tx.financeBillingSubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }));
    expect(tx.financeBillingPayment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ kind: 'PAYMENT_FAILED', confirmedCashMinor: 0 }),
    }));
  });
});
