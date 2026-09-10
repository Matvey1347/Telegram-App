import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { financeRequestFingerprint } from '../assets/finance-asset-idempotency';
import { FinanceInvestmentCashFlowService } from './finance-investment-cash-flow.service';

const now = new Date('2026-09-08T00:00:00.000Z');

function rawTransaction(kind: 'CONTRIBUTION' | 'RETURN') {
  return {
    id: `transaction-${kind}`,
    accountId: 'account-1',
    categoryId: null,
    type: kind === 'CONTRIBUTION' ? ('EXPENSE' as const) : ('INCOME' as const),
    purpose:
      kind === 'CONTRIBUTION'
        ? ('INVESTMENT_CONTRIBUTION' as const)
        : ('INVESTMENT_RETURN' as const),
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
}

function setup(
  kind: 'CONTRIBUTION' | 'RETURN',
  duplicateRow?: ReturnType<typeof flowRow>,
) {
  const transaction = rawTransaction(kind);
  const created = flowRow(kind);
  const tx = {
    financeInvestmentCashFlow: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(created),
    },
    financeInvestment: {
      findFirst: jest.fn().mockResolvedValue({
        name: 'Business',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    financeInvestmentCashFlow: {
      findUnique: jest.fn().mockResolvedValue(duplicateRow || null),
    },
    financeInvestment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'investment-1',
        name: 'Business',
        currency: 'USD',
        status: 'ACTIVE',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
    financeAccount: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'account-1', currency: 'USD' }),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const ledger = {
    profileContext: jest.fn().mockResolvedValue({
      id: 'profile-1',
      defaultCurrency: 'USD',
      workspaceId: 'workspace-1',
    }),
    prepareTransactionRateSource: jest.fn().mockResolvedValue({}),
    prepareTransactionWriteContext: jest.fn().mockResolvedValue({}),
    createTransactionInTransaction: jest.fn().mockResolvedValue({
      id: transaction.id,
      valuationSnapshot: { amount: '10' },
    }),
    account: jest.fn().mockResolvedValue({ id: 'account-1', balance: '90' }),
  };
  const reads = {
    investment: jest.fn().mockResolvedValue({ id: 'investment-1' }),
  };
  const valuation = { lock: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    tx,
    ledger,
    service: new FinanceInvestmentCashFlowService(
      prisma as never,
      ledger as never,
      reads as never,
      valuation as never,
    ),
  };
}

function flowRow(kind: 'CONTRIBUTION' | 'RETURN') {
  return {
    id: `flow-${kind}`,
    investmentId: 'investment-1',
    kind,
    accountId: 'account-1',
    transactionId: `transaction-${kind}`,
    amountInInvestmentCurrency: new Prisma.Decimal(10),
    occurredAt: now,
    note: null,
    createdAt: now,
    requestFingerprint: financeRequestFingerprint({
      investmentId: 'investment-1',
      kind,
      accountId: 'account-1',
      amount: '10',
      occurredAt: now.toISOString(),
      idempotencyKey: `request-${kind}`,
    }),
    account: {
      id: 'account-1',
      name: 'Cash',
      currency: 'USD',
      type: 'CASH' as const,
      emoji: null,
    },
    investment: { currency: 'USD' },
    transaction: rawTransaction(kind),
  };
}

describe('FinanceInvestmentCashFlowService', () => {
  it.each([
    ['CONTRIBUTION', 'EXPENSE', 'INVESTMENT_CONTRIBUTION', 'totalInvested'],
    ['RETURN', 'INCOME', 'INVESTMENT_RETURN', 'totalReturned'],
  ] as const)(
    'writes %s atomically with the correct purpose and additive projection',
    async (kind, type, purpose, projection) => {
      const { service, ledger, tx } = setup(kind);
      await service.record('profile-1', 'investment-1', {
        kind,
        accountId: 'account-1',
        amount: '10',
        occurredAt: now.toISOString(),
        idempotencyKey: `request-${kind}`,
      });
      expect(ledger.createTransactionInTransaction).toHaveBeenCalled();
      const calls = ledger.createTransactionInTransaction.mock
        .calls as unknown as Array<
        [
          unknown,
          unknown,
          { type: string },
          unknown,
          unknown,
          unknown,
          { purpose: string },
        ]
      >;
      expect(calls[0][2].type).toBe(type);
      expect(calls[0][6].purpose).toBe(purpose);
      const updates = tx.financeInvestment.updateMany.mock
        .calls as unknown as Array<
        [{ data: Record<string, { increment: Prisma.Decimal }> }]
      >;
      expect(updates[0][0].data[projection].increment.toString()).toBe('10');
    },
  );

  it('returns a same-fingerprint duplicate without a second write', async () => {
    const duplicate = flowRow('CONTRIBUTION');
    const { service, prisma } = setup('CONTRIBUTION', duplicate);
    const result = await service.record('profile-1', 'investment-1', {
      kind: 'CONTRIBUTION',
      accountId: 'account-1',
      amount: '10',
      occurredAt: now.toISOString(),
      idempotencyKey: 'request-CONTRIBUTION',
    });
    expect(result.duplicate).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a reused key with another fingerprint and a foreign account', async () => {
    const duplicate = { ...flowRow('RETURN'), requestFingerprint: 'different' };
    await expect(
      setup('RETURN', duplicate).service.record('profile-1', 'investment-1', {
        kind: 'RETURN',
        accountId: 'account-1',
        amount: '10',
        occurredAt: now.toISOString(),
        idempotencyKey: 'request-RETURN',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const foreign = setup('CONTRIBUTION');
    foreign.prisma.financeAccount.findFirst.mockResolvedValue(null);
    await expect(
      foreign.service.record('profile-1', 'investment-1', {
        kind: 'CONTRIBUTION',
        accountId: 'foreign',
        amount: '10',
        occurredAt: now.toISOString(),
        idempotencyKey: 'request-foreign',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
