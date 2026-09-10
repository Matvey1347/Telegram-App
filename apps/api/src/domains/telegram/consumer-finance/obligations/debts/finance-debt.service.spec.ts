import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinanceDebtService } from './finance-debt.service';

const account = {
  id: 'account-1',
  name: 'Card',
  currency: 'EUR',
  type: 'CARD' as const,
  emoji: null,
};

function debtRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'debt-1',
    direction: 'I_OWE' as const,
    status: 'OPEN' as const,
    name: 'Alex',
    amount: new Prisma.Decimal(50),
    currency: 'EUR',
    accountId: account.id,
    account,
    dueAt: new Date('2026-09-01T00:00:00.000Z'),
    scheduleTimezone: 'UTC',
    note: null,
    settledAt: null,
    settlementTransactionId: null,
    version: 1,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function obligationProfile() {
  return {
    id: 'profile-1',
    defaultCurrency: 'USD',
    timezone: 'UTC',
    locale: 'en',
    botIntegrationId: 'bot-1',
    telegramBotUserId: 'user-1',
    botIntegration: { workspaceId: 'workspace-1' },
    telegramUser: {
      telegramChatId: '42',
      runtimeInstanceId: 'runtime-1',
      languageCode: 'en',
    },
  };
}

describe('FinanceDebtService', () => {
  it('keeps debt lists bounded, profile-scoped, and derives exact overdue state', async () => {
    const overdue = debtRow({ dueAt: new Date('2020-01-01T00:00:00.000Z') });
    const prisma = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      financeDebt: { findMany: jest.fn().mockResolvedValue([overdue]) },
    };
    const service = new FinanceDebtService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.list('profile-1', { status: 'OPEN', limit: 25 }),
    ).resolves.toMatchObject({ items: [{ id: 'debt-1', isOverdue: true }] });
    expect(prisma.financeDebt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId: 'profile-1', status: 'OPEN' },
        take: 26,
      }),
    );
  });

  it('creates a profile-scoped debt with server-derived currency and one atomic delivery', async () => {
    const row = debtRow();
    const tx = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue(obligationProfile()),
      },
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: account.id, currency: 'EUR' }),
      },
      financeDebt: { create: jest.fn().mockResolvedValue(row) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const delivery = {
      enqueueInTransaction: jest
        .fn()
        .mockResolvedValue({ scheduledAt: row.dueAt }),
      notify: jest.fn(),
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    const presentation = {
      debtDue: jest.fn().mockReturnValue({ text: 'Due' }),
    };
    const service = new FinanceDebtService(
      prisma as never,
      {} as never,
      delivery as never,
      presentation as never,
    );

    await expect(
      service.create('profile-1', {
        direction: 'I_OWE',
        name: ' Alex ',
        amount: '50',
        accountId: account.id,
        dueDate: '2026-09-01',
      }),
    ).resolves.toMatchObject({ currency: 'EUR', accountId: account.id });

    expect(tx.financeAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: account.id, profileId: 'profile-1', archivedAt: null },
      }),
    );
    expect(tx.financeDebt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileId: 'profile-1',
          currency: 'EUR',
          name: 'Alex',
        }),
      }),
    );
    expect(delivery.enqueueInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ financeDebtId: 'debt-1' }),
    );
    expect(delivery.notify).toHaveBeenCalledWith(row.dueAt);
    expect(delivery.reschedule).not.toHaveBeenCalled();
  });

  it('performs zero writes and creates no delivery for a no-op edit', async () => {
    const existing = debtRow();
    const tx = {
      financeDebt: {
        findFirst: jest.fn().mockResolvedValue(existing),
        updateMany: jest.fn(),
      },
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue(obligationProfile()),
      },
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: account.id, currency: 'EUR' }),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const delivery = {
      enqueueInTransaction: jest.fn(),
      cancelPendingInTransaction: jest.fn(),
      notify: jest.fn(),
      reschedule: jest.fn(),
    };
    const service = new FinanceDebtService(
      prisma as never,
      {} as never,
      delivery as never,
      {} as never,
    );

    await service.update('profile-1', 'debt-1', {
      direction: 'I_OWE',
      name: 'Alex',
      amount: '50.00',
      accountId: account.id,
      dueDate: '2026-09-01',
      note: null,
    });

    expect(tx.financeDebt.updateMany).not.toHaveBeenCalled();
    expect(delivery.cancelPendingInTransaction).not.toHaveBeenCalled();
    expect(delivery.notify).not.toHaveBeenCalled();
    expect(delivery.reschedule).not.toHaveBeenCalled();
  });

  it('replaces the due delivery when a debt date really changes', async () => {
    const existing = debtRow();
    const changed = debtRow({
      dueAt: new Date('2026-09-15T00:00:00.000Z'),
      version: 2,
    });
    const tx = {
      financeDebt: {
        findFirst: jest.fn().mockResolvedValue(existing),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(changed),
      },
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue(obligationProfile()),
      },
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: account.id, currency: 'EUR' }),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const delivery = {
      enqueueInTransaction: jest
        .fn()
        .mockResolvedValue({ scheduledAt: changed.dueAt }),
      cancelPendingInTransaction: jest.fn().mockResolvedValue(1),
      notify: jest.fn(),
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    const presentation = {
      debtDue: jest.fn().mockReturnValue({ text: 'Due' }),
    };
    const service = new FinanceDebtService(
      prisma as never,
      {} as never,
      delivery as never,
      presentation as never,
    );

    await service.update('profile-1', 'debt-1', {
      ...inputDebt(),
      dueDate: '2026-09-15',
    });

    expect(delivery.cancelPendingInTransaction).toHaveBeenCalledWith(tx, {
      financeDebtId: 'debt-1',
    });
    expect(delivery.enqueueInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        scheduledAt: changed.dueAt,
        idempotencyKey: 'finance-debt:debt-1:2:2026-09-15T00:00:00.000Z',
      }),
    );
    expect(delivery.reschedule).toHaveBeenCalledWith();
    expect(delivery.notify).toHaveBeenCalledWith(changed.dueAt);
  });

  it('settles atomically with prepared rates and cancels the due notification', async () => {
    const open = debtRow();
    const settled = debtRow({
      status: 'SETTLED',
      version: 2,
      settledAt: new Date(),
      settlementTransactionId: 'transaction-1',
    });
    const tx = {
      financeDebt: {
        findFirst: jest.fn().mockResolvedValue(open),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(settled),
      },
    };
    const prisma = {
      financeDebt: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ status: 'OPEN', currency: 'EUR' }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const rates = { resolve: jest.fn() };
    const writeContext = { accounts: new Map(), categories: new Map(), rates };
    const ledger = {
      profileContext: jest.fn().mockResolvedValue({
        id: 'profile-1',
        defaultCurrency: 'USD',
        timezone: 'UTC',
        workspaceId: 'workspace-1',
      }),
      prepareTransactionRateSource: jest.fn().mockResolvedValue(rates),
      prepareTransactionWriteContext: jest.fn().mockResolvedValue(writeContext),
      createTransactionInTransaction: jest
        .fn()
        .mockResolvedValue({ id: 'transaction-1' }),
    };
    const delivery = {
      cancelPendingInTransaction: jest.fn().mockResolvedValue(1),
      notify: jest.fn(),
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FinanceDebtService(
      prisma as never,
      ledger as never,
      delivery as never,
      {} as never,
    );

    const result = await service.settle('profile-1', 'debt-1');

    expect(result).toMatchObject({
      duplicate: false,
      transaction: { id: 'transaction-1' },
    });
    expect(
      ledger.prepareTransactionRateSource.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
    expect(ledger.prepareTransactionWriteContext).toHaveBeenCalledWith(
      tx,
      'profile-1',
      [expect.objectContaining({ accountId: account.id, type: 'EXPENSE' })],
      rates,
    );
    expect(ledger.createTransactionInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'profile-1' }),
      expect.objectContaining({ accountId: account.id }),
      'MINI_APP',
      undefined,
      writeContext,
    );
    expect(delivery.cancelPendingInTransaction).toHaveBeenCalledWith(tx, {
      financeDebtId: 'debt-1',
    });
    expect(delivery.reschedule).toHaveBeenCalled();
  });

  it.each([
    ['I_OWE', 'EXPENSE'],
    ['OWED_TO_ME', 'INCOME'],
  ] as const)(
    'maps %s settlement to a generated %s',
    async (direction, type) => {
      const open = debtRow({ direction });
      const settled = debtRow({
        direction,
        status: 'SETTLED',
        settlementTransactionId: 'transaction-1',
        version: 2,
      });
      const tx = {
        financeDebt: {
          findFirst: jest.fn().mockResolvedValue(open),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(settled),
        },
      };
      const prisma = {
        financeDebt: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ status: 'OPEN', currency: 'EUR' }),
        },
        $transaction: jest.fn((callback) => callback(tx)),
      };
      const ledger = {
        profileContext: jest.fn().mockResolvedValue({
          id: 'profile-1',
          defaultCurrency: 'EUR',
          timezone: 'UTC',
        }),
        prepareTransactionRateSource: jest.fn().mockResolvedValue({}),
        prepareTransactionWriteContext: jest.fn().mockResolvedValue({}),
        createTransactionInTransaction: jest
          .fn()
          .mockResolvedValue({ id: 'transaction-1' }),
      };
      const delivery = {
        cancelPendingInTransaction: jest.fn().mockResolvedValue(1),
        notify: jest.fn(),
        reschedule: jest.fn().mockResolvedValue(undefined),
      };
      await new FinanceDebtService(
        prisma as never,
        ledger as never,
        delivery as never,
        {} as never,
      ).settle('profile-1', 'debt-1');
      expect(ledger.createTransactionInTransaction).toHaveBeenCalledWith(
        tx,
        expect.anything(),
        expect.objectContaining({ type }),
        'MINI_APP',
        undefined,
        expect.anything(),
      );
    },
  );

  it('returns an already linked settlement without creating another transaction', async () => {
    const settled = debtRow({
      status: 'SETTLED',
      settlementTransactionId: 'transaction-1',
      settledAt: new Date(),
    });
    const transaction = {
      id: 'transaction-1',
      accountId: account.id,
      categoryId: null,
      type: 'EXPENSE',
      amount: new Prisma.Decimal(50),
      currency: 'EUR',
      valuationCurrency: 'USD',
      amountInValuationCurrency: new Prisma.Decimal(55),
      exchangeRateToValuation: new Prisma.Decimal(1.1),
      valuationRateAt: new Date(),
      occurredAt: new Date(),
      description: 'Alex',
      merchantDisplay: null,
      merchantNormalized: 'alex',
      source: 'MINI_APP',
      deletedAt: null,
      account,
      category: null,
      _count: { items: 0 },
    };
    const tx = {
      financeDebt: { findFirst: jest.fn().mockResolvedValue(settled) },
      financeTransaction: {
        findUnique: jest.fn().mockResolvedValue(transaction),
      },
    };
    const prisma = {
      financeDebt: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ status: 'SETTLED', currency: 'EUR' }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const ledger = {
      profileContext: jest.fn().mockResolvedValue({
        id: 'profile-1',
        defaultCurrency: 'EUR',
        timezone: 'UTC',
      }),
      prepareTransactionRateSource: jest.fn(),
      createTransactionInTransaction: jest.fn(),
    };
    const result = await new FinanceDebtService(
      prisma as never,
      ledger as never,
      {} as never,
      {} as never,
    ).settle('profile-1', 'debt-1');
    expect(result).toMatchObject({
      duplicate: true,
      transaction: { id: 'transaction-1' },
    });
    expect(ledger.prepareTransactionRateSource).not.toHaveBeenCalled();
    expect(ledger.createTransactionInTransaction).not.toHaveBeenCalled();
  });

  it('rejects an account outside the current profile', async () => {
    const tx = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue(obligationProfile()),
      },
      financeAccount: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    await expect(
      new FinanceDebtService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
      ).create('profile-1', inputDebt()),
    ).rejects.toThrow('Finance account not found');
    expect(tx.financeAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ profileId: 'profile-1' }),
      }),
    );
  });

  it('rejects a whitespace-only debt name before writing a row', async () => {
    const tx = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue(obligationProfile()),
      },
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: account.id, currency: account.currency }),
      },
      financeDebt: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    await expect(
      new FinanceDebtService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
      ).create('profile-1', { ...inputDebt(), name: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.financeDebt.create).not.toHaveBeenCalled();
  });
});

function inputDebt() {
  return {
    direction: 'I_OWE' as const,
    name: 'Alex',
    amount: '50',
    accountId: account.id,
    dueDate: '2026-09-01',
    note: null,
  };
}
