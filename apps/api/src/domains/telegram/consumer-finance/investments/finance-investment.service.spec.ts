import { Prisma } from '@prisma/client';
import { financeRequestFingerprint } from '../assets/finance-asset-idempotency';
import { FinanceInvestmentService } from './finance-investment.service';

describe('FinanceInvestmentService', () => {
  it('closes atomically with an explicit zero valuation and preserves history', async () => {
    const now = new Date('2026-09-08T00:00:00.000Z');
    const valuation = {
      id: 'valuation-close',
      investmentId: 'investment-1',
      value: new Prisma.Decimal(0),
      currency: 'USD',
      valuedAt: now,
      correctsValuationId: null,
      note: 'Closing valuation',
      createdAt: now,
    };
    const tx = {
      financeInvestmentValuation: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      financeInvestment: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          currentValuationAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financeInvestmentCashFlow: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      financeInvestmentValuation: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      financeInvestment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'investment-1',
          name: 'Business',
          currency: 'USD',
          status: 'ACTIVE',
          version: 1,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          currentValuationAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const ledger = {
      profileContext: jest.fn().mockResolvedValue({
        id: 'profile-1',
        defaultCurrency: 'USD',
        workspaceId: 'workspace-1',
      }),
    };
    const reads = {
      investment: jest.fn().mockResolvedValue({
        id: 'investment-1',
        status: 'CLOSED',
        currentValue: '0',
      }),
    };
    const valuationWriter = {
      lock: jest.fn().mockResolvedValue(undefined),
      appendClosing: jest.fn().mockResolvedValue(valuation),
    };
    const service = new FinanceInvestmentService(
      prisma as never,
      ledger as never,
      reads as never,
      valuationWriter as never,
      {} as never,
    );

    const result = await service.close('profile-1', 'investment-1', {
      closedAt: now.toISOString(),
      idempotencyKey: 'close-request-1',
    });

    expect(valuationWriter.appendClosing).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        investmentId: 'investment-1',
        closedAt: now,
      }),
    );
    expect(tx.financeInvestment.updateMany).toHaveBeenCalled();
    const updateCalls = tx.financeInvestment.updateMany.mock
      .calls as unknown as Array<
      [{ data: { status: string; closedAt: Date } }]
    >;
    expect(updateCalls[0][0].data).toMatchObject({
      status: 'CLOSED',
      closedAt: now,
    });
    expect(result).toMatchObject({
      investment: { status: 'CLOSED', currentValue: '0' },
      valuation: { value: '0' },
      duplicate: false,
    });
  });

  it('replays the complete close result including its original final return', async () => {
    const now = new Date('2026-09-08T00:00:00.000Z');
    const input = {
      closedAt: now.toISOString(),
      idempotencyKey: 'close-request-1',
      finalReturn: { accountId: 'account-1', amount: '10', note: 'Final' },
    };
    const valuation = {
      id: 'valuation-close',
      investmentId: 'investment-1',
      value: new Prisma.Decimal(0),
      currency: 'USD',
      valuedAt: now,
      correctsValuationId: null,
      correctedBy: null,
      note: 'Closing valuation',
      createdAt: now,
      requestFingerprint: financeRequestFingerprint({
        investmentId: 'investment-1',
        ...input,
      }),
    };
    const transaction = {
      id: 'transaction-return',
      accountId: 'account-1',
      categoryId: null,
      type: 'INCOME' as const,
      purpose: 'INVESTMENT_RETURN' as const,
      amount: new Prisma.Decimal(10),
      currency: 'USD',
      valuationCurrency: 'USD',
      amountInValuationCurrency: new Prisma.Decimal(10),
      exchangeRateToValuation: new Prisma.Decimal(1),
      valuationRateAt: now,
      occurredAt: now,
      description: 'Business',
      merchantDisplay: null,
      merchantNormalized: null,
      source: 'MINI_APP' as const,
      deletedAt: null,
      account: {
        id: 'account-1',
        name: 'Cash',
        currency: 'USD',
        type: 'CASH' as const,
        emoji: null,
      },
      category: null,
      _count: { items: 0 },
    };
    const cashFlow = {
      id: 'flow-return',
      investmentId: 'investment-1',
      kind: 'RETURN' as const,
      accountId: 'account-1',
      transactionId: transaction.id,
      amountInInvestmentCurrency: new Prisma.Decimal(10),
      occurredAt: now,
      note: 'Final',
      createdAt: now,
      account: transaction.account,
      investment: { currency: 'USD' },
      transaction,
    };
    const prisma = {
      financeInvestmentValuation: {
        findUnique: jest.fn().mockResolvedValue(valuation),
      },
      financeInvestmentCashFlow: {
        findUnique: jest.fn().mockResolvedValue(cashFlow),
      },
      $transaction: jest.fn(),
    };
    const ledger = {
      account: jest.fn().mockResolvedValue({ id: 'account-1', balance: '10' }),
    };
    const reads = {
      investment: jest.fn().mockResolvedValue({
        id: 'investment-1',
        status: 'CLOSED',
      }),
    };
    const service = new FinanceInvestmentService(
      prisma as never,
      ledger as never,
      reads as never,
      {} as never,
      {} as never,
    );

    const result = await service.close('profile-1', 'investment-1', input);

    expect(result).toMatchObject({
      duplicate: true,
      cashFlow: { id: 'flow-return', amount: '10' },
      transaction: { id: 'transaction-return' },
      account: { id: 'account-1', balance: '10' },
      valuation: { id: 'valuation-close', value: '0' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
