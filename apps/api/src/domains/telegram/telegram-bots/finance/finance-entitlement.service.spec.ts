import { FINANCE_PRODUCT_DEFINITIONS, FinanceEntitlementService } from './finance-entitlement.service';

describe('FinanceEntitlementService', () => {
  it('maps an active canonical plan to Finance capabilities', async () => {
    const prisma = {
      botSubscription: { findMany: jest.fn().mockResolvedValue([{ plan: { code: 'pro' }, currentPeriodEnd: new Date('2030-01-01'), cancelAtPeriodEnd: false, grants: [] }]) },
      financeProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
      aiUsageEvent: { count: jest.fn().mockResolvedValue(0) },
    } as never;
    const service = new FinanceEntitlementService(prisma);

    await expect(
      service.has({ botIntegrationId: 'finance-bot', telegramBotUserId: 'user' }, 'AI_INPUT'),
    ).resolves.toBe(true);
    expect((prisma as any).botSubscription.findMany).toHaveBeenCalled();
  });

  it('keeps Free AI trials lifetime and defines the Finance prices centrally', async () => {
    const prisma = {
      botSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      financeProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
      aiUsageEvent: { count: jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(2) },
    } as never;
    const resolved = await new FinanceEntitlementService(prisma).resolve({ botIntegrationId: 'finance-bot', telegramBotUserId: 'user' });
    expect(resolved).toMatchObject({ tier: 'FREE', usage: [{ feature: 'AI_INPUT', used: 10, limit: 10, remaining: 0, resetAt: null }, { feature: 'RECEIPT_SCAN', used: 2, limit: 3, remaining: 1, resetAt: null }] });
    expect(FINANCE_PRODUCT_DEFINITIONS.PRO.price).toMatchObject({ amountMinor: 14900, currency: 'UAH' });
    expect(FINANCE_PRODUCT_DEFINITIONS.ULTIMATE.price).toMatchObject({ amountMinor: 24900, currency: 'UAH' });
  });
});
