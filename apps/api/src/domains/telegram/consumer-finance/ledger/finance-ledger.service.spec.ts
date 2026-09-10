import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
    const preparedRateLookup = jest.fn().mockResolvedValue({
      available: false,
      code: 'RATE_UNAVAILABLE',
      message: 'missing',
    });
    const conversion = {
      prepareRateSource: jest.fn().mockResolvedValue({
        getRateMetadata: preparedRateLookup,
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
    expect(conversion.prepareRateSource).toHaveBeenCalledWith('workspace-a');
    expect(preparedRateLookup).toHaveBeenCalledWith('EUR', 'USD');
  });
  it('loads missing account currency and workspace context in one profile read', async () => {
    const prisma: any = {
      financeAccount: { findMany: jest.fn().mockResolvedValue([]) },
      financeTransaction: { groupBy: jest.fn().mockResolvedValue([]) },
      financeTransfer: { groupBy: jest.fn().mockResolvedValue([]) },
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          defaultCurrency: 'UAH',
          botIntegration: { workspaceId: 'workspace-a' },
        }),
      },
    };

    await expect(
      new FinanceLedgerService(prisma).accounts('profile-a'),
    ).resolves.toEqual([]);
    expect(prisma.financeProfile.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.financeProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'profile-a' },
      select: {
        defaultCurrency: true,
        botIntegration: { select: { workspaceId: true } },
      },
    });
  });
  it('uses one request-scoped rate graph for ten account currencies', async () => {
    const prisma: any = {
      financeAccount: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 10 }, (_, index) => ({
            id: `account-${index}`,
            name: `Account ${index}`,
            emoji: null,
            type: 'OTHER',
            currency: `X${String(index).padStart(2, '0')}`,
            openingBalance: new Prisma.Decimal(1),
            archivedAt: null,
          })),
        ),
      },
      financeTransaction: { groupBy: jest.fn().mockResolvedValue([]) },
      financeTransfer: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const preparedRateLookup = jest.fn().mockResolvedValue({
      available: true,
      rate: 2,
      rateAt: new Date('2026-08-27T00:00:00.000Z'),
      stale: false,
    });
    const conversion = {
      prepareRateSource: jest.fn().mockResolvedValue({
        getRateMetadata: preparedRateLookup,
      }),
    };

    const accounts = await new FinanceLedgerService(
      prisma,
      conversion as never,
    ).accounts('profile-a', 'USD', 'workspace-a');

    expect(accounts).toHaveLength(10);
    expect(conversion.prepareRateSource).toHaveBeenCalledTimes(1);
    expect(preparedRateLookup).toHaveBeenCalledTimes(10);
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
      $queryRaw: jest.fn().mockResolvedValue([
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.1,
          date: old,
        },
      ]),
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
    const rateQueries = prisma.$queryRaw.mock.calls.filter(([statement]) =>
      statement.strings.join(' ').includes('SELECT DISTINCT ON'),
    );
    expect(rateQueries.length).toBeGreaterThan(0);
    expect(
      rateQueries.every(([statement]) =>
        statement.values.includes('workspace-a'),
      ),
    ).toBe(true);
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
      $queryRaw: jest.fn().mockResolvedValue([
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.1,
          date: occurredAt,
        },
      ]),
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
    const rateQueries = prisma.$queryRaw.mock.calls.filter(([statement]) =>
      statement.strings.join(' ').includes('SELECT DISTINCT ON'),
    );
    expect(rateQueries.length).toBeGreaterThan(0);
    expect(
      rateQueries.some(
        ([statement]) =>
          statement.values.includes('workspace-a') &&
          statement.values.some(
            (value) =>
              value instanceof Date &&
              value.getTime() === occurredAt.getTime(),
          ),
      ),
    ).toBe(true);
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

  it('protects debt settlements and recurring occurrences from generic edits and deletes', async () => {
    const tx = {
      financeTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'generated-1',
          accountId: 'account-a',
          categoryId: null,
          merchantDisplay: null,
          debtSettlement: { id: 'debt-1' },
          recurringPaymentOccurrence: null,
        }),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((callback) => callback(tx)),
      financeTransaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({
          debtSettlement: null,
          recurringPaymentOccurrence: { id: 'occurrence-1' },
        }),
      },
    };
    const ledger = new FinanceLedgerService(prisma);
    await expect(
      ledger.updateTransaction(
        { id: 'profile-a', defaultCurrency: 'USD' },
        'generated-1',
        {
          accountId: 'account-a',
          type: 'EXPENSE',
          amount: '10',
          occurredAt: new Date().toISOString(),
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      ledger.removeTransaction('profile-a', 'generated-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          debtSettlement: { is: null },
          recurringPaymentOccurrence: { is: null },
        }),
      }),
    );
  });

  it('suppresses merchant learning for a generated recurring transaction', async () => {
    const occurredAt = new Date('2026-09-01T12:00:00.000Z');
    const tx: any = {
      financeAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'account-a',
          currency: 'USD',
        }),
      },
      financeCategory: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'category-a',
          name: 'Rent',
          key: 'rent',
          type: 'EXPENSE',
          emoji: null,
        }),
      },
      financeTransaction: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'transaction-a',
            ...data,
            account: {
              id: 'account-a',
              name: 'Card',
              currency: 'USD',
              type: 'CARD',
              emoji: null,
            },
            category: {
              id: 'category-a',
              name: 'Rent',
              key: 'rent',
              type: 'EXPENSE',
              emoji: null,
            },
            _count: { items: 0 },
          }),
        ),
      },
      financeMerchantMapping: { upsert: jest.fn() },
    };

    await new FinanceLedgerService({} as never).createTransactionInTransaction(
      tx,
      { id: 'profile-a', defaultCurrency: 'USD', workspaceId: 'workspace-a' },
      {
        accountId: 'account-a',
        categoryId: 'category-a',
        type: 'EXPENSE',
        amount: '1000',
        description: 'Rent',
        occurredAt: occurredAt.toISOString(),
      },
      'MINI_APP',
      undefined,
      undefined,
      { suppressMerchantMapping: true },
    );

    expect(tx.financeMerchantMapping.upsert).not.toHaveBeenCalled();
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

  it('prepares and reuses immutable current/as-of USD and default-currency rates', async () => {
    const historical = '2020-01-02T12:00:00.000Z';
    const current = '2099-01-02T12:00:00.000Z';
    const rateAt = new Date('2020-01-02T00:00:00.000Z');
    const preparedRateLookup = jest.fn((from, to, asOf) =>
      Promise.resolve({
        available: true as const,
        rate: to === 'USD' ? (asOf ? 1.2 : 1.3) : asOf ? 44 : 45,
        rateAt,
        stale: false as const,
      }),
    );
    const conversion = {
      prepareRateSource: jest.fn((_workspaceId, asOf) =>
        Promise.resolve({
          getRateMetadata: (from, to) => preparedRateLookup(from, to, asOf),
        }),
      ),
    };
    const prisma = { financeProfile: { findUnique: jest.fn() } };
    const source = await new FinanceLedgerService(
      prisma as never,
      conversion as never,
    ).prepareTransactionRateSource(
      {
        id: 'profile-a',
        defaultCurrency: 'UAH',
        workspaceId: 'workspace-a',
      },
      [
        { currency: 'EUR', occurredAt: historical },
        { currency: 'EUR', occurredAt: historical },
        { currency: 'EUR', occurredAt: current },
      ],
    );

    expect(conversion.prepareRateSource).toHaveBeenCalledTimes(2);
    expect(conversion.prepareRateSource).toHaveBeenCalledWith(
      'workspace-a',
      new Date(historical),
    );
    expect(conversion.prepareRateSource).toHaveBeenCalledWith(
      'workspace-a',
      undefined,
    );
    expect(preparedRateLookup).toHaveBeenCalledTimes(4);
    expect(preparedRateLookup).toHaveBeenCalledWith(
      'EUR',
      'USD',
      new Date(historical),
    );
    expect(preparedRateLookup).toHaveBeenCalledWith('EUR', 'UAH', undefined);
    expect(prisma.financeProfile.findUnique).not.toHaveBeenCalled();
    const first = source.resolve('EUR', 'USD', new Date(historical));
    expect(first).toEqual({ rate: new Prisma.Decimal(1.2), rateAt });
    first.rate = new Prisma.Decimal(99);
    first.rateAt.setUTCFullYear(1999);
    expect(source.resolve('EUR', 'USD', new Date(historical))).toEqual({
      rate: new Prisma.Decimal(1.2),
      rateAt,
    });
    expect(source.resolve('EUR', 'UAH', new Date(current)).rate).toEqual(
      new Prisma.Decimal(45),
    );
  });

  it('fails rate preparation before a financial transaction can open', async () => {
    const conversion = {
      prepareRateSource: jest.fn().mockResolvedValue({
        getRateMetadata: jest.fn().mockResolvedValue({
          available: false,
          code: 'RATE_UNAVAILABLE',
          message: 'missing EUR rate',
        }),
      }),
    };
    const prisma = {
      financeProfile: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new FinanceLedgerService(
      prisma as never,
      conversion as never,
    );

    await expect(
      service.prepareTransactionRateSource(
        {
          id: 'profile-a',
          defaultCurrency: 'USD',
          workspaceId: 'workspace-a',
        },
        [{ currency: 'EUR', occurredAt: '2099-01-01T00:00:00.000Z' }],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bounds ten distinct dated operations to two requested rate pairs each', async () => {
    const preparedRateLookup = jest.fn().mockResolvedValue({
      available: true,
      rate: 1,
      rateAt: new Date('2020-01-01T00:00:00.000Z'),
      stale: false,
    });
    const conversion = {
      prepareRateSource: jest.fn().mockResolvedValue({
        getRateMetadata: preparedRateLookup,
      }),
    };
    const service = new FinanceLedgerService({} as never, conversion as never);
    const operations = Array.from({ length: 10 }, (_, index) => ({
      currency: 'EUR',
      occurredAt: `2020-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    }));

    await service.prepareTransactionRateSource(
      {
        id: 'profile-a',
        defaultCurrency: 'UAH',
        workspaceId: 'workspace-a',
      },
      operations,
    );
    expect(conversion.prepareRateSource).toHaveBeenCalledTimes(10);
    expect(preparedRateLookup).toHaveBeenCalledTimes(20);
    await expect(
      service.prepareTransactionRateSource(
        {
          id: 'profile-a',
          defaultCurrency: 'UAH',
          workspaceId: 'workspace-a',
        },
        [...operations, operations[0]],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
