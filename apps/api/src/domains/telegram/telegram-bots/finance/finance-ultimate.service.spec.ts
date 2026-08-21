import { BadRequestException } from '@nestjs/common';
import { FinanceUltimateService } from './finance-ultimate.service';

describe('FinanceUltimateService', () => {
  const profile = {
    defaultCurrency: 'UAH',
    timezone: 'Europe/Warsaw',
    botIntegration: { workspaceId: 'workspace-1' },
  };

  it('returns item totals with explicit receipt coverage and never loads transaction rows', async () => {
    const prisma = {
      financeProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ label: 'Bread', amount: 860, transactions: BigInt(3) }])
        .mockResolvedValueOnce([{ purchases: BigInt(112), covered: BigInt(37) }]),
    };
    const result = await new FinanceUltimateService(prisma as never, {} as never).items('profile-1', {});
    expect(result.rows).toEqual([{ name: 'Bread', amount: '860', quantity: null }]);
    expect(result).toMatchObject({ currency: 'UAH', totalPurchaseCount: 112, availablePurchaseCount: 37 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(
      prisma.$queryRaw.mock.calls[0][0].strings.join(''),
    ).toContain('i."currency" = ');
    expect(
      prisma.$queryRaw.mock.calls[1][0].strings.join(''),
    ).toContain('i."currency" = ');
  });

  it('only reports a merchant anomaly after a transparent minimum baseline', async () => {
    const prisma = {
      financeProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
      $queryRaw: jest.fn().mockResolvedValue([{ label: 'Taxi', current: 470, average: 100, occurredAt: new Date('2026-01-01') }]),
    };
    const result = await new FinanceUltimateService(prisma as never, {} as never).anomalies('profile-1');
    expect(result.anomalies).toEqual([expect.objectContaining({ merchant: 'Taxi', amount: '470', usualAmount: '100', multiple: 4.7 })]);
  });

  it('rejects an unbounded Ultimate reporting period before querying aggregates', async () => {
    const prisma = { financeProfile: { findUnique: jest.fn().mockResolvedValue(profile) }, $queryRaw: jest.fn() };
    await expect(new FinanceUltimateService(prisma as never, {} as never).analytics('profile-1', { from: '2024-01-01', to: '2026-01-02' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('uses the authoritative converted balance including transfers and reports missing rates', async () => {
    const prisma = {
      financeProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
      financeReminder: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const ledger = {
      accounts: jest.fn().mockResolvedValue([
        {
          id: 'uah',
          name: 'Cash',
          currency: 'UAH',
          balance: '100',
          archivedAt: null,
        },
        {
          id: 'eur',
          name: 'Card',
          currency: 'EUR',
          balance: '10',
          equivalentBalance: { amount: '450', currency: 'UAH' },
          archivedAt: null,
        },
        {
          id: 'gbp',
          name: 'Travel',
          currency: 'GBP',
          balance: '20',
          equivalentBalance: null,
          archivedAt: null,
        },
      ]),
    };

    const result = await new FinanceUltimateService(
      prisma as never,
      ledger as never,
    ).overview('profile-1');

    expect(result.balance).toBe('550');
    expect(result.balanceSummary).toEqual({
      amount: '550',
      currency: 'UAH',
      includedAccountCount: 2,
      excludedAccounts: [
        {
          accountId: 'gbp',
          name: 'Travel',
          balance: '20',
          currency: 'GBP',
          reason: 'RATE_UNAVAILABLE',
        },
      ],
    });
    expect(ledger.accounts).toHaveBeenCalledWith(
      'profile-1',
      'UAH',
      'workspace-1',
    );
  });
});
