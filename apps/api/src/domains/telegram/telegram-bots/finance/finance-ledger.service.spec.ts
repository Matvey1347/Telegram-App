import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { FinanceLedgerService } from './finance-ledger.service';

describe('FinanceLedgerService tenant and money rules', () => {
  it('does not create a transaction against another profile account', async () => {
    const prisma: any = {
      financeAccount: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    const service = new FinanceLedgerService(prisma);
    await expect(
      service.createTransaction(
        { id: 'profile-a', defaultCurrency: 'UAH' },
        {
          accountId: 'account-b',
          type: 'EXPENSE',
          amount: '10.00',
          currency: 'UAH',
          occurredAt: new Date().toISOString(),
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect((prisma as any).financeAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'account-b', profileId: 'profile-a', archivedAt: null },
    });
  });
  it('rejects a same-currency transfer whose ledger sides differ', async () => {
    const prisma = {
      financeAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', currency: 'UAH' },
          { id: 'b', currency: 'UAH' },
        ]),
      },
    } as never;
    const service = new FinanceLedgerService(prisma);
    await expect(
      service.createTransfer('profile-a', {
        fromAccountId: 'a',
        toAccountId: 'b',
        fromAmount: '100',
        toAmount: '99',
        occurredAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('makes undo user-scoped and idempotent', async () => {
    const prisma = {
      financeTransaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({ deletedAt: null }),
      },
    } as never;
    await expect(
      new FinanceLedgerService(prisma).undo('profile-a', 'transaction-a'),
    ).resolves.toEqual({ undone: true, duplicate: true });
    expect((prisma as any).financeTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'transaction-a',
          profileId: 'profile-a',
          deletedAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
        data: { deletedAt: null },
      }),
    );
  });
  it('restores a just soft-deleted transaction without crossing profile boundaries', async () => {
    const prisma = {
      financeTransaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
      },
    } as never;
    await expect(
      new FinanceLedgerService(prisma).undo('profile-a', 'transaction-a'),
    ).resolves.toEqual({ undone: true, duplicate: false });
    expect((prisma as any).financeTransaction.findFirst).not.toHaveBeenCalled();
  });

  it('keeps legacy rows visible in analytics without treating their old default amount as USD', async () => {
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          type: 'EXPENSE', categoryId: null, categoryName: null, currency: 'EUR',
          day: new Date('2026-08-01T00:00:00.000Z'),
          valuedAmount: new Prisma.Decimal(10), legacyNativeAmount: new Prisma.Decimal(50),
          legacyTransactionCount: BigInt(1),
        },
        {
          type: 'EXPENSE', categoryId: null, categoryName: null, currency: 'PLN',
          day: new Date('2026-08-01T00:00:00.000Z'),
          valuedAmount: new Prisma.Decimal(0), legacyNativeAmount: new Prisma.Decimal(20),
          legacyTransactionCount: BigInt(1),
        },
      ]),
    };
    const result = await new FinanceLedgerService(prisma).analytics(
      { id: 'profile-a', defaultCurrency: 'USD' },
      { period: 'CUSTOM', from: '2026-08-01T00:00:00.000Z', to: '2026-08-02T00:00:00.000Z' },
    );
    expect(result.summary.expenses).toBe('10');
    expect(result.legacyFallback).toEqual({
      transactionCount: 2,
      nativeAmounts: [
        { currency: 'EUR', amount: '50' },
        { currency: 'PLN', amount: '20' },
      ],
      reason: 'UNKNOWN_HISTORICAL_DEFAULT_CURRENCY',
    });
  });

  it('returns only an explicit valuation snapshot for a non-USD-default transaction', async () => {
    const created = {
      id: 'transaction-a', accountId: 'account-a', categoryId: null,
      type: 'EXPENSE', amount: new Prisma.Decimal(10), currency: 'EUR',
      amountInDefaultCurrency: new Prisma.Decimal(450), exchangeRateToDefault: new Prisma.Decimal(45),
      valuationCurrency: 'USD', amountInValuationCurrency: new Prisma.Decimal(11),
      exchangeRateToValuation: new Prisma.Decimal(1.1), valuationRateAt: new Date('2026-08-16T00:00:00.000Z'),
      occurredAt: new Date(), description: null,
    };
    const prisma: any = {
      financeAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'account-a', currency: 'EUR' }) },
      financeTransaction: { create: jest.fn().mockResolvedValue(created) },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    const conversion = {
      getRateMetadata: jest.fn().mockResolvedValue({ available: true, rate: 1.1, rateAt: new Date(), stale: false }),
    };
    const result = await new FinanceLedgerService(prisma, conversion as any).createTransaction(
      { id: 'profile-a', defaultCurrency: 'UAH', workspaceId: 'workspace-a' },
      { accountId: 'account-a', type: 'EXPENSE', amount: '10', occurredAt: new Date().toISOString() },
    );
    expect(result).not.toHaveProperty('amountInDefaultCurrency');
    expect(result).not.toHaveProperty('exchangeRateToDefault');
    expect(result.valuationSnapshot).toMatchObject({ currency: 'USD', amount: '11' });
    expect(prisma.financeTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amountInDefaultCurrency: new Prisma.Decimal(11), exchangeRateToDefault: new Prisma.Decimal(1.1) }),
    }));
  });

  it('rejects a stale rate for a current write even when occurredAt is provided', async () => {
    const old = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const prisma: any = {
      financeAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'account-a', currency: 'EUR' }) },
      exchangeRate: { findMany: jest.fn().mockResolvedValue([
        { baseCurrency: 'EUR', targetCurrency: 'USD', rate: 1.1, date: old },
      ]) },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    await expect(
      new FinanceLedgerService(prisma, new CurrencyConversionService(prisma)).createTransaction(
        { id: 'profile-a', defaultCurrency: 'USD', workspaceId: 'workspace-a' },
        { accountId: 'account-a', type: 'EXPENSE', amount: '10', occurredAt: new Date().toISOString() },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'workspace-a' },
    }));
  });

  it('uses a dated historical rate for a transaction before today', async () => {
    const occurredAt = new Date(Date.now() - 3 * 86400000);
    const prisma: any = {
      financeAccount: { findFirst: jest.fn().mockResolvedValue({ id: 'account-a', currency: 'EUR' }) },
      financeTransaction: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'transaction-a', ...data })) },
      exchangeRate: { findMany: jest.fn().mockResolvedValue([
        { baseCurrency: 'EUR', targetCurrency: 'USD', rate: 1.1, date: occurredAt },
      ]) },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    await expect(
      new FinanceLedgerService(prisma, new CurrencyConversionService(prisma)).createTransaction(
        { id: 'profile-a', defaultCurrency: 'USD', workspaceId: 'workspace-a' },
        { accountId: 'account-a', type: 'EXPENSE', amount: '10', occurredAt: occurredAt.toISOString() },
      ),
    ).resolves.toMatchObject({ valuationSnapshot: { currency: 'USD', amount: '11' } });
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'workspace-a', date: { lte: occurredAt } },
    }));
  });
});
