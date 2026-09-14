import { Prisma } from '@prisma/client';
import { FinanceAssetSummaryService } from './finance-asset-summary.service';

describe('FinanceAssetSummaryService', () => {
  it('does not add savings allocations to net worth', async () => {
    const prisma = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          defaultCurrency: 'USD',
          botIntegration: { workspaceId: 'workspace-1' },
        }),
      },
      financeInvestment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'investment-1',
            name: 'Business',
            currency: 'USD',
            status: 'ACTIVE',
            valuationCurrency: 'USD',
            totalInvestedInValuationCurrency: new Prisma.Decimal(50),
            totalReturnedInValuationCurrency: new Prisma.Decimal(5),
            currentValueInValuationCurrency: new Prisma.Decimal(20),
            currentValuationAt: new Date('2026-08-01T00:00:00.000Z'),
          },
        ]),
      },
    };
    const savings = {
      summary: jest.fn().mockResolvedValue({
        currency: 'USD',
        allocated: '60',
        backed: '60',
        activeGoals: 1,
        completedGoals: 0,
        underfundedGoals: 0,
        excludedGoals: [],
      }),
    };
    const service = new FinanceAssetSummaryService(
      prisma as never,
      savings as never,
    );

    const result = await service.overview('profile-1', {
      amount: '100',
      currency: 'USD',
      includedAccountCount: 1,
      excludedAccounts: [],
    });

    expect(result.savings.allocated).toBe('60');
    expect(result.netWorth).toMatchObject({
      cashAmount: '100',
      investmentValue: '20',
      amount: '120',
    });
  });

  it('uses active investment book value until its first manual valuation', async () => {
    const prisma = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          defaultCurrency: 'USD',
          botIntegration: { workspaceId: 'workspace-1' },
        }),
      },
      financeInvestment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'investment-1',
            name: 'New business',
            currency: 'USD',
            status: 'ACTIVE',
            valuationCurrency: 'USD',
            totalInvestedInValuationCurrency: new Prisma.Decimal(100),
            totalReturnedInValuationCurrency: new Prisma.Decimal(0),
            currentValueInValuationCurrency: new Prisma.Decimal(0),
            currentValuationAt: null,
          },
        ]),
      },
    };
    const service = new FinanceAssetSummaryService(
      prisma as never,
      {
        summary: jest.fn().mockResolvedValue({ excludedGoals: [] }),
      } as never,
    );

    const result = await service.overview('profile-1', {
      amount: '100',
      currency: 'USD',
      includedAccountCount: 1,
      excludedAccounts: [],
    });

    expect(result.investments).toMatchObject({
      totalInvested: '100',
      currentValue: '100',
      profitLoss: '0',
      returnPercentage: 0,
      excludedInvestments: [],
    });
    expect(result.netWorth).toMatchObject({ amount: '200', complete: true });
  });

  it('converts a non-USD investment valuation into the profile currency', async () => {
    const prisma = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          defaultCurrency: 'PLN',
          botIntegration: { workspaceId: 'workspace-1' },
        }),
      },
      financeInvestment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'investment-1',
            name: 'Ukrainian business',
            currency: 'UAH',
            status: 'ACTIVE',
            valuationCurrency: 'UAH',
            totalInvestedInValuationCurrency: new Prisma.Decimal(1000),
            totalReturnedInValuationCurrency: new Prisma.Decimal(100),
            currentValueInValuationCurrency: new Prisma.Decimal(1200),
            currentValuationAt: new Date('2026-09-01T00:00:00.000Z'),
          },
        ]),
      },
    };
    const rateSource = {
      getRateMetadata: jest.fn().mockResolvedValue({
        available: true,
        rate: 0.1,
        rateAt: new Date('2026-09-14T00:00:00.000Z'),
      }),
    };
    const conversion = {
      prepareRateSource: jest.fn().mockResolvedValue(rateSource),
    };
    const service = new FinanceAssetSummaryService(
      prisma as never,
      {
        summary: jest.fn().mockResolvedValue({ excludedGoals: [] }),
      } as never,
      conversion as never,
    );

    const result = await service.overview('profile-1', {
      amount: '50',
      currency: 'PLN',
      includedAccountCount: 1,
      excludedAccounts: [],
    });

    expect(conversion.prepareRateSource).toHaveBeenCalledWith('workspace-1');
    expect(rateSource.getRateMetadata).toHaveBeenCalledWith('UAH', 'PLN');
    expect(result.investments).toMatchObject({
      totalInvested: '100',
      totalReturned: '10',
      currentValue: '120',
      excludedInvestments: [],
    });
    expect(result.netWorth).toMatchObject({
      amount: '170',
      complete: true,
    });
  });
});
