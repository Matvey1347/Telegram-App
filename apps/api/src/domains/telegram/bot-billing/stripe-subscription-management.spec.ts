import {
  createStripePlanChangeSession,
  getStripeRenewalPreview,
} from './stripe-subscription-management';

describe('Stripe subscription management', () => {
  const input = {
    customerId: 'cus_owner',
    providerSubscriptionId: 'sub_current',
    priceId: 'price_quarterly',
    returnUrl: 'https://finance.example/app/subscription',
  };
  function setup() {
    const subscription = {
      id: input.providerSubscriptionId,
      customer: input.customerId,
      status: 'active',
      items: {
        data: [
          {
            id: 'si_active',
            current_period_end: 1_900_000_000,
            price: {
              id: 'price_monthly',
              recurring: { interval: 'month', interval_count: 1 },
            },
            quantity: 1,
          },
        ],
      },
    };
    const stripe = {
      subscriptions: { retrieve: jest.fn().mockResolvedValue(subscription) },
      invoices: {
        createPreview: jest.fn().mockResolvedValue({
          amount_due: 15900,
          currency: 'uah',
          next_payment_attempt: null,
        }),
      },
      prices: {
        retrieve: jest.fn().mockResolvedValue({
          id: input.priceId,
          active: true,
          recurring: { interval: 'month' },
          product: 'prod_plus',
        }),
      },
      billingPortal: {
        configurations: {
          list: jest.fn().mockResolvedValue({ data: [] }),
          create: jest.fn().mockResolvedValue({ id: 'bpc_plus' }),
        },
        sessions: {
          create: jest
            .fn()
            .mockResolvedValue({ url: 'https://billing.stripe.com/p/session' }),
        },
      },
    };
    return { stripe, subscription };
  }

  it('uses the invoice preview amount including discounts and the subscribed interval', async () => {
    const { stripe } = setup();
    await expect(
      getStripeRenewalPreview(stripe as never, input.providerSubscriptionId),
    ).resolves.toEqual({
      amountMinor: 15900,
      currency: 'UAH',
      chargeAt: new Date(1_900_000_000_000).toISOString(),
      interval: 'MONTH',
      intervalCount: 1,
    });
    expect(stripe.invoices.createPreview).toHaveBeenCalledWith({
      subscription: input.providerSubscriptionId,
    });
  });

  it('uses a scoped Stripe confirmation and reuses an existing plan configuration', async () => {
    const { stripe } = setup();
    const { configurations, sessions } = stripe.billingPortal;
    configurations.list.mockResolvedValueOnce({
      data: [
        {
          id: 'bpc_existing',
          metadata: {
            groshlyPlanChange: 'groshly-plus-change-v1:price_quarterly',
          },
        },
      ],
    });
    await expect(
      createStripePlanChangeSession(stripe as never, input),
    ).resolves.toBe('https://billing.stripe.com/p/session');
    expect(configurations.create).not.toHaveBeenCalled();
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: input.customerId,
        configuration: 'bpc_existing',
        flow_data: expect.objectContaining({
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: input.providerSubscriptionId,
            items: [{ id: 'si_active', price: input.priceId, quantity: 1 }],
          },
        }),
      }),
    );
  });

  it('creates a narrowly configured confirmation flow for a new target price', async () => {
    const { stripe } = setup();
    await createStripePlanChangeSession(stripe as never, input);
    expect(stripe.billingPortal.configurations.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        features: {
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
        },
      }),
      { idempotencyKey: 'groshly-billing-default-v1' },
    );
    expect(stripe.billingPortal.configurations.create).toHaveBeenCalledWith(
      expect.objectContaining({
        features: {
          payment_method_update: { enabled: true },
          subscription_update: expect.objectContaining({
            products: [{ product: 'prod_plus', prices: [input.priceId] }],
          }),
        },
      }),
      { idempotencyKey: 'groshly-plus-change-v1:price_quarterly' },
    );
  });

  it('cannot open a confirmation for another Stripe customer', async () => {
    const { stripe, subscription } = setup();
    subscription.customer = 'cus_other';
    await expect(
      createStripePlanChangeSession(stripe as never, input),
    ).rejects.toThrow('Stripe cannot change');
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
    expect(stripe.billingPortal.configurations.create).not.toHaveBeenCalled();
  });
});
