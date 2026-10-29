import Stripe from 'stripe';
import { FinanceStripeService } from './finance-stripe.service';

describe('Finance Stripe webhook boundary', () => {
  const testKey = 'sk_test_' + 'x'.repeat(32);
  const testSecret = 'whsec_' + 'y'.repeat(32);
  const service = new FinanceStripeService({
    stripeMode: 'TEST', stripeTestSecretKey: testKey, stripeTestWebhookSecret: testSecret,
    stripeLiveSecretKey: undefined, stripeLiveWebhookSecret: undefined,
  } as any);

  it('accepts a correctly signed TEST event and rejects a changed body', () => {
    const body = JSON.stringify({ id: 'evt_1', object: 'event', type: 'invoice.paid', livemode: false, data: { object: { id: 'in_1' } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: testSecret });
    expect(service.webhook('TEST', Buffer.from(body), signature).id).toBe('evt_1');
    expect(() => service.webhook('TEST', Buffer.from(body + ' '), signature)).toThrow('Invalid Finance Stripe signature or mode');
  });

  it('rejects a signed LIVE event delivered to the TEST endpoint', () => {
    const body = JSON.stringify({ id: 'evt_live', object: 'event', type: 'invoice.paid', livemode: true, data: { object: { id: 'in_1' } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: testSecret });
    expect(() => service.webhook('TEST', Buffer.from(body), signature)).toThrow('Invalid Finance Stripe signature or mode');
  });
});
