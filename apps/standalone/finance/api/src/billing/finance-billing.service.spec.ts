import { ConflictException } from '@nestjs/common';
import { FinanceBillingService } from './finance-billing.service';

const session = { financeBotId: 'bot-1', financeTelegramUserId: 'user-1', profileId: 'profile-1', expiresAt: Date.now() + 10000 };
function setup(subscriptions: any[] = [], cashFacts: any[] = [], introUsed: any = null) {
  const prisma = {
    financeBillingSubscription: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { status?: unknown } }) => Promise.resolve(
        where.status ? subscriptions.filter(item => ['ACTIVE', 'GIFT', 'CANCELED'].includes(item.status) && (!item.currentPeriodEnd || item.currentPeriodEnd > new Date())) : subscriptions,
      )),
      findFirst: jest.fn().mockResolvedValue(introUsed),
      create: jest.fn(), update: jest.fn(),
    },
    financeBillingPayment: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue(cashFacts),
    },
    financeBillingPrice: { findFirst: jest.fn().mockResolvedValue({ id: 'price-1', stripePriceId: 'price_1' }) },
    financeProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
    $transaction: jest.fn(),
  } as any;
  const stripe = { mode: () => 'TEST', client: jest.fn() } as any;
  const config = { stripeMode: 'TEST', webPublicUrl: 'https://finance.example' } as any;
  return { service: new FinanceBillingService(prisma, stripe, config), prisma, stripe };
}
const active = { id: 'sub-1', financeBotId: 'bot-1', profileId: 'profile-1', status: 'ACTIVE', source: 'STRIPE', offer: 'MONTH', currentPeriodEnd: new Date(Date.now()+86400000), cancelAtPeriodEnd: false, createdAt: new Date() };
describe('Finance Billing entitlement and offers', () => {
  it('does not grant PLUS from Stripe active status without confirmed cash', async () => {
    const { service } = setup([active]);
    expect((await service.catalog(session)).tier).toBe('FREE');
  });
  it('grants PLUS after cash and removes it after full refund; partial refund retains access', async () => {
    const paid = { subscriptionId: 'sub-1', kind: 'PAYMENT_SUCCEEDED', _sum: { confirmedCashMinor: 17900 } };
    const refund = (amount: number) => ({ subscriptionId: 'sub-1', kind: 'REFUND', _sum: { confirmedCashMinor: amount } });
    expect((await setup([active], [paid]).service.catalog(session)).tier).toBe('PLUS');
    expect((await setup([active], [paid, refund(1000)]).service.catalog(session)).tier).toBe('PLUS');
    const fullyRefunded = await setup([active], [paid, refund(17900)]).service.catalog(session);
    expect(fullyRefunded.tier).toBe('FREE');
    expect(fullyRefunded.subscription?.id).toBe('sub-1');
  });
  it('preserves gift rights without fabricating a payment', async () => {
    const gift = { ...active, source: 'GIFT', status: 'GIFT' };
    const { service, prisma } = setup([gift]);
    expect((await service.catalog(session)).tier).toBe('PLUS');
    expect(prisma.financeBillingPayment.create).toBeUndefined();
  });
  it('keeps an older indefinite gift after twenty newer expired subscriptions', async () => {
    const gift = { ...active, id: 'old-gift', source: 'GIFT', status: 'GIFT', currentPeriodEnd: null };
    const recent = Array.from({ length: 20 }, (_, index) => ({ ...active, id: `expired-${index}`, status: 'EXPIRED', currentPeriodEnd: new Date(0) }));
    const { service, prisma } = setup();
    prisma.financeBillingSubscription.findMany
      .mockResolvedValueOnce(recent)
      .mockResolvedValueOnce([gift]);
    expect((await service.catalog(session)).tier).toBe('PLUS');
  });
  it('keeps intro available after abandoned Checkout but hides it after redemption', async () => {
    const abandoned = { ...active, status: 'EXPIRED', introUsed: true, stripeCheckoutId: 'cs_expired' };
    expect((await setup([abandoned]).service.catalog(session)).offers.find(x => x.code === 'INTRO')?.available).toBe(true);
    expect((await setup([abandoned], [], { id: 'redeemed' }).service.catalog(session)).offers.find(x => x.code === 'INTRO')?.available).toBe(false);
  });
  it('does not advertise intro again after its Stripe subscription moves to MONTH', async () => {
    const monthlyPhase = { ...active, offer: 'MONTH', introUsed: true, status: 'CANCELED', currentPeriodEnd: new Date(0) };
    const { service, prisma } = setup([monthlyPhase], [], { id: 'redeemed' });
    const catalog = await service.catalog(session);
    expect(catalog.offers.find(x => x.code === 'INTRO')?.available).toBe(false);
    expect(prisma.financeBillingSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ introUsed: true }),
    }));
  });
  it('rejects another Checkout while the same user has a pending reservation', async () => {
    const { service, prisma, stripe } = setup();
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      financeBillingSubscription: {
        findMany: jest.fn().mockResolvedValue([{ status: 'PENDING', checkoutExpiresAt: new Date(Date.now() + 60_000) }]),
        findFirst: jest.fn(), create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation((work: (value: typeof tx) => Promise<unknown>) => work(tx));
    await expect(service.checkout(session, 'MONTH')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.financeBillingSubscription.create).not.toHaveBeenCalled();
    expect(stripe.client).not.toHaveBeenCalled();
  });
  it('returns users to the actual subscription screen from Checkout', async () => {
    const { service, prisma, stripe } = setup();
    const reservation = { id: 'reservation', checkoutExpiresAt: new Date(Date.now() + 32 * 60_000) };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      financeBillingSubscription: {
        findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(reservation),
      },
    };
    prisma.$transaction.mockImplementation((work: (value: typeof tx) => Promise<unknown>) => work(tx));
    prisma.financeBillingSubscription.findFirst.mockResolvedValue(null);
    prisma.financeBillingSubscription.update.mockResolvedValue({});
    const createSession = jest.fn().mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.com/session' });
    stripe.client.mockReturnValue({
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus_123' }) },
      checkout: { sessions: { create: createSession } },
    });
    expect(await service.checkout(session, 'MONTH')).toEqual({ url: 'https://checkout.stripe.com/session' });
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      success_url: expect.stringContaining('screen=subscription&checkout=success'),
      cancel_url: expect.stringContaining('screen=subscription&checkout=cancel'),
    }), expect.anything());
  });
});
