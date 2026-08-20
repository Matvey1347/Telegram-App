import { BotBillingConnectionStatus, BotBillingProviderMode } from '@prisma/client';
import { StripeBillingProvider } from './stripe-billing.provider';

describe('StripeBillingProvider credential mode validation', () => {
  const provider = new StripeBillingProvider({} as never, {} as never);
  it('rejects a live key in TEST without contacting Stripe', async () => {
    await expect(provider.validateKey('sk_live_secret', BotBillingProviderMode.TEST)).resolves.toEqual({ status: BotBillingConnectionStatus.INVALID, error: 'Stripe key does not match TEST mode' });
  });
  it('rejects a test key in LIVE without contacting Stripe', async () => {
    await expect(provider.validateKey('sk_test_secret', BotBillingProviderMode.LIVE)).resolves.toEqual({ status: BotBillingConnectionStatus.INVALID, error: 'Stripe key does not match LIVE mode' });
  });
});
