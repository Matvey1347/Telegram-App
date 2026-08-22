import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { FinanceLedgerService } from './finance-ledger.service';

describe('FinanceLedgerService tenant and money rules', () => {
  const restoredTransaction = {
    id: 'transaction-a',
    accountId: 'account-a',
    categoryId: null,
    type: 'EXPENSE',
    amount: new Prisma.Decimal(10),
    currency: 'UAH',
    valuationCurrency: 'USD',
    amountInValuationCurrency: new Prisma.Decimal(0.25),
    exchangeRateToValuation: new Prisma.Decimal(0.025),
    valuationRateAt: new Date(),
    occurredAt: new Date(),
    description: null,
    deletedAt: null,
    account: { id: 'account-a', name: 'Cash', currency: 'UAH' },
    category: null,
  };
  it('calculates account balances with transfers and never fabricates a missing conversion', async () => {
    const prisma: any = {
      financeAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'usd',
            name: 'Cash',
            type: 'CASH',
            currency: 'USD',
            openingBalance: new Prisma.Decimal(100),
            archivedAt: null,
          },
          {
            id: 'eur',
            name: 'Euro card',
            type: 'CARD',
            currency: 'EUR',
            openingBalance: new Prisma.Decimal(50),
            archivedAt: null,
          },
        ]),
      },
      financeTransaction: {
        groupBy: jest.fn().mockResolvedValue([
          {
            accountId: 'usd',
            type: 'INCOME',
            _sum: { amount: new Prisma.Decimal(25) },
          },
        ]),
      },
      financeTransfer: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            {
              fromAccountId: 'usd',
              _sum: { fromAmount: new Prisma.Decimal(20) },
            },
          ])
          .mockResolvedValueOnce([
            { toAccountId: 'eur', _sum: { toAmount: new Prisma.Decimal(18) } },
          ]),
      },
    };
    const conversion = {
      getRateMetadata: jest.fn().mockResolvedValue({
        available: false,
        code: 'RATE_UNAVAILABLE',
        message: 'missing',
      }),
    };

    const accounts = await new FinanceLedgerService(
      prisma,
      conversion as never,
    ).accounts('profile-a', 'USD', 'workspace-a');

    expect(accounts).toEqual([
      expect.objectContaining({ id: 'usd', balance: '105' }),
      expect.objectContaining({
        id: 'eur',
        balance: '68',
        equivalentBalance: null,
      }),
    ]);
    expect(conversion.getRateMetadata).toHaveBeenCalledWith(
      'EUR',
      'USD',
      'workspace-a',
    );
  });
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
  it('makes undo user-scoped and idempotent', async () => {
    const prisma = {
      financeTransaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(restoredTransaction),
      },
    } as never;
    await expect(
      new FinanceLedgerService(prisma).undo('profile-a', 'transaction-a'),
    ).resolves.toMatchObject({
      undone: true,
      duplicate: true,
      transaction: { id: 'transaction-a' },
    });
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
        findFirst: jest.fn().mockResolvedValue(restoredTransaction),
      },
    } as never;
    await expect(
      new FinanceLedgerService(prisma).undo('profile-a', 'transaction-a'),
    ).resolves.toMatchObject({
      undone: true,
      duplicate: false,
      transaction: { id: 'transaction-a' },
    });
    expect((prisma as any).financeTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'transaction-a', profileId: 'profile-a' },
      }),
    );
  });

  it('keeps legacy rows visible in analytics without treating their old default amount as USD', async () => {
    const prisma: any = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          type: 'EXPENSE',
          categoryId: null,
          categoryName: null,
          currency: 'EUR',
          day: '2026-08-01',
          nativeAmount: new Prisma.Decimal(50),
          valuedAmount: new Prisma.Decimal(10),
          legacyNativeAmount: new Prisma.Decimal(50),
          legacyTransactionCount: BigInt(1),
        },
        {
          type: 'EXPENSE',
          categoryId: null,
          categoryName: null,
          currency: 'PLN',
          day: '2026-08-01',
          nativeAmount: new Prisma.Decimal(20),
          valuedAmount: new Prisma.Decimal(0),
          legacyNativeAmount: new Prisma.Decimal(20),
          legacyTransactionCount: BigInt(1),
        },
      ]),
    };
    const result = await new FinanceLedgerService(prisma).analytics(
      { id: 'profile-a', defaultCurrency: 'USD' },
      {
        period: 'CUSTOM',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-02T00:00:00.000Z',
      },
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

  it('returns zero analytics for an empty non-USD profile without requesting a rate', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const conversion = { getRateMetadata: jest.fn() };
    const result = await new FinanceLedgerService(
      prisma,
      conversion as never,
    ).analytics(
      {
        id: 'profile-a',
        defaultCurrency: 'UAH',
        timezone: 'Pacific/Kiritimati',
        workspaceId: 'workspace-a',
      },
      { period: 'CURRENT_MONTH' },
    );
    expect(result).toMatchObject({
      currency: 'UAH',
      summary: { income: '0', expenses: '0', netCashflow: '0' },
    });
    expect(conversion.getRateMetadata).not.toHaveBeenCalled();
  });

  it('keeps native profile-currency totals exact instead of converting them through USD', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([
      { type: 'INCOME', categoryId: null, categoryName: null, categoryKey: null, currency: 'UAH', day: '2026-08-21', nativeAmount: new Prisma.Decimal(150), valuedAmount: new Prisma.Decimal('3.61'), legacyNativeAmount: new Prisma.Decimal(0), legacyTransactionCount: BigInt(0) },
      { type: 'EXPENSE', categoryId: 'category-1', categoryName: 'Entertainment', categoryKey: 'entertainment', currency: 'UAH', day: '2026-08-21', nativeAmount: new Prisma.Decimal(100), valuedAmount: new Prisma.Decimal('2.41'), legacyNativeAmount: new Prisma.Decimal(0), legacyTransactionCount: BigInt(0) },
    ]) };
    const conversion = { getRateMetadata: jest.fn().mockResolvedValue({ available: true, rate: '36.34' }) };
    const result = await new FinanceLedgerService(prisma, conversion as never).analytics(
      { id: 'profile-a', defaultCurrency: 'UAH', timezone: 'Europe/Warsaw', workspaceId: 'workspace-a' },
      { period: 'CUSTOM', from: '2026-08-21T00:00:00.000Z', to: '2026-08-22T00:00:00.000Z' },
    );
    expect(result.summary).toEqual({ income: '150', expenses: '100', netCashflow: '50' });
    expect(result.expensesByCategory[0].amount).toBe('100');
    expect(conversion.getRateMetadata).not.toHaveBeenCalled();
  });

  it('groups analytics by the selected day without creating a second timezone SQL parameter', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    await new FinanceLedgerService({ $queryRaw: queryRaw } as never).analytics(
      {
        id: 'profile-a',
        defaultCurrency: 'USD',
        timezone: 'Europe/Warsaw',
      },
      {
        period: 'CUSTOM',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-02T00:00:00.000Z',
      },
    );

    const [sql, ...parameters] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(sql.join('?')).toContain(
      'GROUP BY t."type", t."categoryId", c."name", c."key", t."currency", 6',
    );
    expect(
      parameters.filter((value) => value === 'Europe/Warsaw'),
    ).toHaveLength(1);
  });

  it('returns only an explicit valuation snapshot for a non-USD-default transaction', async () => {
    const created = {
      id: 'transaction-a',
      accountId: 'account-a',
      categoryId: null,
      type: 'EXPENSE',
      amount: new Prisma.Decimal(10),
      currency: 'EUR',
      amountInDefaultCurrency: new Prisma.Decimal(450),
      exchangeRateToDefault: new Prisma.Decimal(45),
      valuationCurrency: 'USD',
      amountInValuationCurrency: new Prisma.Decimal(11),
      exchangeRateToValuation: new Prisma.Decimal(1.1),
      valuationRateAt: new Date('2026-08-16T00:00:00.000Z'),
      occurredAt: new Date(),
      description: null,
    };
    const prisma: any = {
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'account-a', currency: 'EUR' }),
      },
      financeTransaction: { create: jest.fn().mockResolvedValue(created) },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    const conversion = {
      getRateMetadata: jest.fn().mockResolvedValue({
        available: true,
        rate: 1.1,
        rateAt: new Date(),
        stale: false,
      }),
    };
    const result = await new FinanceLedgerService(
      prisma,
      conversion as any,
    ).createTransaction(
      { id: 'profile-a', defaultCurrency: 'UAH', workspaceId: 'workspace-a' },
      {
        accountId: 'account-a',
        type: 'EXPENSE',
        amount: '10',
        occurredAt: new Date().toISOString(),
      },
    );
    expect(result).not.toHaveProperty('amountInDefaultCurrency');
    expect(result).not.toHaveProperty('exchangeRateToDefault');
    expect(result.valuationSnapshot).toMatchObject({
      currency: 'USD',
      amount: '11',
    });
    expect(prisma.financeTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountInDefaultCurrency: new Prisma.Decimal(11),
          exchangeRateToDefault: new Prisma.Decimal(1.1),
        }),
      }),
    );
  });

  it('rejects a stale rate for a current write even when occurredAt is provided', async () => {
    const old = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const prisma: any = {
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'account-a', currency: 'EUR' }),
      },
      exchangeRate: {
        findMany: jest.fn().mockResolvedValue([
          {
            baseCurrency: 'EUR',
            targetCurrency: 'USD',
            rate: 1.1,
            date: old,
          },
        ]),
      },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    await expect(
      new FinanceLedgerService(
        prisma,
        new CurrencyConversionService(prisma),
      ).createTransaction(
        { id: 'profile-a', defaultCurrency: 'USD', workspaceId: 'workspace-a' },
        {
          accountId: 'account-a',
          type: 'EXPENSE',
          amount: '10',
          occurredAt: new Date().toISOString(),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-a' },
      }),
    );
  });

  it('uses a dated historical rate for a transaction before today', async () => {
    const occurredAt = new Date(Date.now() - 3 * 86400000);
    const prisma: any = {
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'account-a', currency: 'EUR' }),
      },
      financeTransaction: {
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'transaction-a', ...data }),
          ),
      },
      exchangeRate: {
        findMany: jest.fn().mockResolvedValue([
          {
            baseCurrency: 'EUR',
            targetCurrency: 'USD',
            rate: 1.1,
            date: occurredAt,
          },
        ]),
      },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    await expect(
      new FinanceLedgerService(
        prisma,
        new CurrencyConversionService(prisma),
      ).createTransaction(
        { id: 'profile-a', defaultCurrency: 'USD', workspaceId: 'workspace-a' },
        {
          accountId: 'account-a',
          type: 'EXPENSE',
          amount: '10',
          occurredAt: occurredAt.toISOString(),
        },
      ),
    ).resolves.toMatchObject({
      valuationSnapshot: { currency: 'USD', amount: '11' },
    });
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-a', date: { lte: occurredAt } },
      }),
    );
  });

  it('edits an existing transaction with unchanged archived references and refreshes its merchant mapping atomically', async () => {
    const occurredAt = new Date('2026-07-01T12:00:00.000Z');
    const updated = {
      ...restoredTransaction,
      categoryId: 'category-a',
      occurredAt,
      description: 'Coffee',
      account: { id: 'account-a', name: 'Old card', currency: 'USD' },
      category: {
        id: 'category-a',
        name: 'Food',
        key: 'food',
        type: 'EXPENSE' as const,
      },
    };
    const tx: any = {
      financeTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'transaction-a',
          accountId: 'account-a',
          categoryId: 'category-a',
        }),
        update: jest.fn().mockResolvedValue(updated),
      },
      financeAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'account-a',
          currency: 'USD',
          archivedAt: new Date(),
        }),
      },
      financeCategory: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'category-a',
          type: 'EXPENSE',
          archivedAt: new Date(),
        }),
      },
      financeMerchantMapping: { upsert: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const result = await new FinanceLedgerService(prisma).updateTransaction(
      { id: 'profile-a', defaultCurrency: 'USD', workspaceId: 'workspace-a' },
      'transaction-a',
      {
        accountId: 'account-a',
        categoryId: 'category-a',
        type: 'EXPENSE',
        amount: '10',
        occurredAt: occurredAt.toISOString(),
        description: ' Coffee ',
      },
    );
    expect(result).toMatchObject({
      occurredAt,
      description: 'Coffee',
      category: { key: 'food' },
    });
    expect(
      tx.financeAccount.findFirst.mock.calls[0][0].where,
    ).not.toHaveProperty('archivedAt');
    expect(
      tx.financeCategory.findFirst.mock.calls[0][0].where,
    ).not.toHaveProperty('archivedAt');
    expect(tx.financeTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ occurredAt, description: 'Coffee' }),
      }),
    );
    expect(tx.financeMerchantMapping.upsert).toHaveBeenCalled();
  });

  it('rejects a reversed history range', async () => {
    await expect(
      new FinanceLedgerService({} as never).history('profile-a', {
        from: '2026-08-02T00:00:00.000Z',
        to: '2026-08-01T00:00:00.000Z',
        limit: 30,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('searches transaction descriptions and category names without dropping profile filters', async () => {
    const prisma: any = {
      financeTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new FinanceLedgerService(prisma).history('profile-a', {
      search: 'food',
      type: 'EXPENSE',
      limit: 30,
    });

    expect(prisma.financeTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          profileId: 'profile-a',
          deletedAt: null,
          type: 'EXPENSE',
          OR: [
            {
              description: { contains: 'food', mode: 'insensitive' },
            },
            {
              merchantDisplay: { contains: 'food', mode: 'insensitive' },
            },
            {
              merchantNormalized: { contains: 'food', mode: 'insensitive' },
            },
            {
              category: {
                name: { contains: 'food', mode: 'insensitive' },
              },
            },
          ],
        }),
      }),
    );
  });

  it('treats a date-only history end as the exclusive next UTC day', async () => {
    const prisma: any = {
      financeTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new FinanceLedgerService(prisma).history('profile-a', {
      from: '2026-08-01',
      to: '2026-08-21',
      limit: 30,
    });
    expect(prisma.financeTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          occurredAt: {
            gte: new Date('2026-08-01T00:00:00.000Z'),
            lt: new Date('2026-08-22T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('uses the profile timezone for date-only history boundaries', async () => {
    const prisma: any = {
      financeTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new FinanceLedgerService(prisma).history(
      'profile-a',
      { from: '2026-08-21', to: '2026-08-21', limit: 30 },
      'Pacific/Kiritimati',
    );
    expect(
      prisma.financeTransaction.findMany.mock.calls[0][0].where.occurredAt,
    ).toEqual({
      gte: new Date('2026-08-20T10:00:00.000Z'),
      lt: new Date('2026-08-21T10:00:00.000Z'),
    });
  });

  it('keeps a full timestamp history end as an inclusive boundary', async () => {
    const prisma: any = {
      financeTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const to = '2026-08-21T18:30:00.000Z';
    await new FinanceLedgerService(prisma).history('profile-a', {
      to,
      limit: 30,
    });
    const occurredAt =
      prisma.financeTransaction.findMany.mock.calls[0][0].where.occurredAt;
    expect(occurredAt).toMatchObject({ lte: new Date(to) });
    expect(occurredAt).not.toHaveProperty('lt');
  });
});
