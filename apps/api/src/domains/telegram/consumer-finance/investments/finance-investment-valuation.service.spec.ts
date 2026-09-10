import { Prisma } from '@prisma/client';
import { FinanceInvestmentValuationService } from './finance-investment-valuation.service';

const currentDate = new Date('2026-09-08T00:00:00.000Z');
const backdated = new Date('2026-08-01T00:00:00.000Z');

function valuation(id: string, value: number, valuedAt: Date) {
  return {
    id,
    investmentId: 'investment-1',
    value: new Prisma.Decimal(value),
    currency: 'USD',
    valuedAt,
    correctsValuationId: null,
    note: null,
    createdAt: valuedAt,
  };
}

describe('FinanceInvestmentValuationService', () => {
  it('appends a backdated value but keeps the latest effective projection', async () => {
    const created = valuation('backdated', 80, backdated);
    const latest = {
      value: new Prisma.Decimal(100),
      amountInValuationCurrency: new Prisma.Decimal(100),
      valuedAt: currentDate,
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      financeInvestmentValuation: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(latest),
        create: jest.fn().mockResolvedValue(created),
      },
      financeInvestment: {
        findFirst: jest.fn().mockResolvedValue({
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      financeInvestmentValuation: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      financeInvestment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'investment-1',
          currency: 'USD',
          status: 'ACTIVE',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new FinanceInvestmentValuationService(
      prisma as never,
      {
        profileContext: jest
          .fn()
          .mockResolvedValue({ id: 'profile-1', defaultCurrency: 'USD' }),
      } as never,
      {
        investment: jest.fn().mockResolvedValue({ id: 'investment-1' }),
      } as never,
    );

    await service.record('profile-1', 'investment-1', {
      value: '80',
      valuedAt: backdated.toISOString(),
      idempotencyKey: 'valuation-backdated',
    });

    expect(tx.financeInvestmentValuation.create).toHaveBeenCalledTimes(1);
    const updateCalls = tx.financeInvestment.update.mock
      .calls as unknown as Array<
      [{ data: { currentValue: Prisma.Decimal; currentValuationAt: Date } }]
    >;
    expect(updateCalls[0][0].data.currentValue.toString()).toBe('100');
    expect(updateCalls[0][0].data.currentValuationAt).toEqual(currentDate);
    const latestCalls = tx.financeInvestmentValuation.findFirst.mock
      .calls as unknown as Array<[{ where: unknown; orderBy: unknown[] }]>;
    expect(latestCalls[0][0]).toMatchObject({
      where: { correctedBy: null },
      orderBy: [{ valuedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('links a correction and only accepts an effective, uncorrected source', async () => {
    const corrected = valuation('correction', 95, currentDate);
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      financeInvestmentValuation: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'old' })
          .mockResolvedValueOnce({
            value: new Prisma.Decimal(95),
            amountInValuationCurrency: new Prisma.Decimal(95),
            valuedAt: currentDate,
          }),
        create: jest.fn().mockResolvedValue(corrected),
      },
      financeInvestment: {
        findFirst: jest.fn().mockResolvedValue({
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      financeInvestmentValuation: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      financeInvestment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'investment-1',
          currency: 'USD',
          status: 'ACTIVE',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const service = new FinanceInvestmentValuationService(
      prisma as never,
      {
        profileContext: jest
          .fn()
          .mockResolvedValue({ id: 'profile-1', defaultCurrency: 'USD' }),
      } as never,
      {
        investment: jest.fn().mockResolvedValue({ id: 'investment-1' }),
      } as never,
    );

    await service.record('profile-1', 'investment-1', {
      value: '95',
      valuedAt: currentDate.toISOString(),
      correctsValuationId: 'old',
      idempotencyKey: 'valuation-correction',
    });

    const sourceCalls = tx.financeInvestmentValuation.findFirst.mock
      .calls as unknown as Array<[{ where: Record<string, unknown> }]>;
    expect(sourceCalls[0][0].where).toMatchObject({
      id: 'old',
      profileId: 'profile-1',
      investmentId: 'investment-1',
      correctedBy: null,
    });
    const createCalls = tx.financeInvestmentValuation.create.mock
      .calls as unknown as Array<[{ data: { correctsValuationId: string } }]>;
    expect(createCalls[0][0].data.correctsValuationId).toBe('old');
  });
});
