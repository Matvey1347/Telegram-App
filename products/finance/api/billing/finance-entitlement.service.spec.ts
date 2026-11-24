import { FINANCE_PRODUCT_DEFINITIONS, FinanceEntitlementService } from '@consumer-finance/api/billing/finance-entitlement.service';

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

  it('blocks Free AI use and defines the Finance Plus offers centrally', async () => {
    const prisma = {
      botSubscription: { findMany: jest.fn().mockResolvedValue([]) },
      financeProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
      aiUsageEvent: { count: jest.fn().mockResolvedValue(0) },
    } as never;
    const resolved = await new FinanceEntitlementService(prisma).resolve({ botIntegrationId: 'finance-bot', telegramBotUserId: 'user' });
    expect(resolved).toMatchObject({ tier: 'FREE', usage: [{ feature: 'AI_INPUT', used: 0, limit: 0, remaining: 0, resetAt: null }, { feature: 'RECEIPT_SCAN', used: 0, limit: 0, remaining: 0, resetAt: null }] });
    expect(FINANCE_PRODUCT_DEFINITIONS.PRO.prices).toEqual([
      { amountMinor: 700, currency: 'UAH', interval: 'DAY', intervalCount: 7 },
      { amountMinor: 17900, currency: 'UAH', interval: 'MONTH', intervalCount: 1 },
      { amountMinor: 39900, currency: 'UAH', interval: 'MONTH', intervalCount: 3 },
      { amountMinor: 109900, currency: 'UAH', interval: 'YEAR', intervalCount: 1 },
    ]);
  });
});
