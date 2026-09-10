import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinanceRegularPaymentConfirmationService } from './finance-regular-payment-confirmation.service';

const account = {
  id: 'account-1',
  name: 'Card',
  currency: 'USD',
  type: 'CARD' as const,
  emoji: null,
};
const category = {
  id: 'category-1',
  name: 'Rent',
  key: 'rent',
  type: 'EXPENSE' as const,
  emoji: null,
};
const expected = new Date('2026-08-31T00:00:00.000Z');

function regular(overrides: Record<string, unknown> = {}) {
  return {
    id: 'regular-1',
    profileId: 'profile-1',
    name: 'Rent',
    amount: new Prisma.Decimal(1000),
    currency: 'USD',
    accountId: account.id,
    account,
    categoryId: category.id,
    category,
    recurrence: 'MONTHLY' as const,
    anchorDay: 31,
    anchorMonth: null,
    nextOccurrenceAt: expected,
    scheduleTimezone: 'UTC',
    note: null,
    status: 'ACTIVE' as const,
    version: 3,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

const profileContext = {
  id: 'profile-1',
  defaultCurrency: 'USD',
  // The profile may change timezone after this payment was configured.
  timezone: 'Pacific/Kiritimati',
  workspaceId: 'workspace-1',
};
const obligationProfile = {
  ...profileContext,
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

function occurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'occurrence-1',
    recurringPaymentId: 'regular-1',
    transactionId: 'transaction-1',
    configVersion: 3,
    scheduledFor: expected,
    scheduledAmount: new Prisma.Decimal(1000),
    paidAmount: new Prisma.Decimal(900),
    currency: 'USD',
    confirmedAt: new Date('2026-08-31T12:00:00.000Z'),
    futureAmountAppliedAt: null,
    ...overrides,
  };
}

describe('FinanceRegularPaymentConfirmationService', () => {
  it.each([
    ['900', true],
    [undefined, false],
  ] as const)(
    'confirms amount %s atomically and reports future update=%s',
    async (paidAmount, futureAmountUpdateRequired) => {
      const current = regular();
      const advanced = regular({
        nextOccurrenceAt: new Date('2026-09-30T00:00:00.000Z'),
        version: 4,
      });
      const confirmedOccurrence = occurrence({
        paidAmount: new Prisma.Decimal(paidAmount ?? 1000),
      });
      const tx = {
        financeRecurringPayment: {
          findFirst: jest.fn().mockResolvedValue(current),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(advanced),
        },
        financeRecurringPaymentOccurrence: {
          create: jest.fn().mockResolvedValue(confirmedOccurrence),
        },
        financeProfile: {
          findUnique: jest.fn().mockResolvedValue(obligationProfile),
        },
      };
      const prisma = {
        financeRecurringPayment: {
          findFirst: jest.fn().mockResolvedValue({
            status: 'ACTIVE',
            currency: 'USD',
            nextOccurrenceAt: expected,
            version: 3,
          }),
        },
        $transaction: jest.fn((callback) => callback(tx)),
      };
      const rates = { resolve: jest.fn() };
      const writeContext = {
        accounts: new Map(),
        categories: new Map(),
        rates,
      };
      const ledger = {
        profileContext: jest.fn().mockResolvedValue(profileContext),
        prepareTransactionRateSource: jest.fn().mockResolvedValue(rates),
        prepareTransactionWriteContext: jest
          .fn()
          .mockResolvedValue(writeContext),
        createTransactionInTransaction: jest
          .fn()
          .mockResolvedValue({ id: 'transaction-1' }),
      };
      const deliveries = {
        replace: jest.fn().mockResolvedValue({
          scheduledAt: advanced.nextOccurrenceAt,
        }),
        reschedule: jest.fn().mockResolvedValue(undefined),
      };
      const service = new FinanceRegularPaymentConfirmationService(
        prisma as never,
        ledger as never,
        deliveries as never,
      );

      const result = await service.confirm('profile-1', 'regular-1', {
        expectedOccurrenceAt: expected.toISOString(),
        expectedVersion: 3,
        ...(paidAmount ? { amount: paidAmount } : {}),
      });

      expect(result).toMatchObject({
        duplicate: false,
        futureAmountUpdateRequired,
        occurrence: {
          scheduledFor: expected.toISOString(),
          paidAmount: paidAmount ?? '1000',
        },
      });
      expect(
        ledger.prepareTransactionRateSource.mock.invocationCallOrder[0],
      ).toBeLessThan(prisma.$transaction.mock.invocationCallOrder[0]);
      expect(ledger.prepareTransactionWriteContext).toHaveBeenCalledWith(
        tx,
        'profile-1',
        [
          expect.objectContaining({
            accountId: 'account-1',
            amount: paidAmount ?? '1000',
          }),
        ],
        rates,
      );
      expect(ledger.createTransactionInTransaction).toHaveBeenCalledWith(
        tx,
        profileContext,
        expect.objectContaining({
          type: 'EXPENSE',
          description: 'Rent',
        }),
        'MINI_APP',
        undefined,
        writeContext,
        { suppressMerchantMapping: true },
      );
      expect(tx.financeRecurringPayment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            nextOccurrenceAt: expected,
            version: 3,
          }),
          data: {
            nextOccurrenceAt: advanced.nextOccurrenceAt,
            version: { increment: 1 },
          },
        }),
      );
      expect(deliveries.reschedule).toHaveBeenCalledWith(
        advanced.nextOccurrenceAt,
      );
    },
  );

  it('returns the original confirmation on a repeated exact occurrence without advancing again', async () => {
    const advanced = regular({
      nextOccurrenceAt: new Date('2026-09-30T00:00:00.000Z'),
    });
    const storedOccurrence = occurrence({ futureAmountAppliedAt: new Date() });
    const transaction = {
      id: 'transaction-1',
      accountId: account.id,
      categoryId: category.id,
      type: 'EXPENSE',
      amount: new Prisma.Decimal(900),
      currency: 'USD',
      valuationCurrency: 'USD',
      amountInValuationCurrency: new Prisma.Decimal(900),
      exchangeRateToValuation: new Prisma.Decimal(1),
      valuationRateAt: expected,
      occurredAt: expected,
      description: 'Rent',
      merchantDisplay: null,
      merchantNormalized: 'rent',
      source: 'MINI_APP',
      deletedAt: null,
      account,
      category,
      _count: { items: 0 },
    };
    const tx = {
      financeRecurringPayment: {
        findFirst: jest.fn().mockResolvedValue(advanced),
      },
      financeRecurringPaymentOccurrence: {
        findUnique: jest.fn().mockResolvedValue(storedOccurrence),
      },
      financeTransaction: {
        findUnique: jest.fn().mockResolvedValue(transaction),
      },
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
    };
    const prisma = {
      financeRecurringPayment: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          currency: 'USD',
          nextOccurrenceAt: advanced.nextOccurrenceAt,
          version: advanced.version,
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const ledger = {
      profileContext: jest.fn().mockResolvedValue(profileContext),
      prepareTransactionRateSource: jest.fn(),
      createTransactionInTransaction: jest.fn(),
    };
    const service = new FinanceRegularPaymentConfirmationService(
      prisma as never,
      ledger as never,
      {} as never,
    );

    await expect(
      service.confirm('profile-1', 'regular-1', {
        expectedOccurrenceAt: expected.toISOString(),
        expectedVersion: 3,
      }),
    ).resolves.toMatchObject({
      duplicate: true,
      futureAmountUpdateRequired: false,
      transaction: { id: 'transaction-1' },
    });
    expect(ledger.prepareTransactionRateSource).not.toHaveBeenCalled();
    expect(ledger.createTransactionInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a stale notification version without creating a transaction', async () => {
    const changed = regular({ version: 4, amount: new Prisma.Decimal(4000) });
    const tx = {
      financeRecurringPayment: {
        findFirst: jest.fn().mockResolvedValue(changed),
      },
    };
    const prisma = {
      financeRecurringPayment: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          currency: 'USD',
          nextOccurrenceAt: expected,
          version: 4,
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const ledger = {
      profileContext: jest.fn().mockResolvedValue(profileContext),
      prepareTransactionRateSource: jest.fn(),
      createTransactionInTransaction: jest.fn(),
    };
    const service = new FinanceRegularPaymentConfirmationService(
      prisma as never,
      ledger as never,
      {} as never,
    );

    await expect(
      service.confirm('profile-1', 'regular-1', {
        expectedOccurrenceAt: expected.toISOString(),
        expectedVersion: 3,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ledger.prepareTransactionRateSource).not.toHaveBeenCalled();
    expect(ledger.createTransactionInTransaction).not.toHaveBeenCalled();
  });

  it('guards future amount application with the current config version', async () => {
    const tx = {
      financeRecurringPayment: {
        findFirst: jest.fn().mockResolvedValue(regular()),
      },
      financeRecurringPaymentOccurrence: {
        findFirst: jest.fn().mockResolvedValue(occurrence()),
      },
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue(obligationProfile),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new FinanceRegularPaymentConfirmationService(
      prisma as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.applyFutureAmount('profile-1', 'regular-1', 'occurrence-1', {
        expectedVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('applies a changed occurrence amount to future payments only after Yes with expectedVersion', async () => {
    const current = regular();
    const updated = regular({ amount: new Prisma.Decimal(900), version: 4 });
    const tx = {
      financeRecurringPayment: {
        findFirst: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
      financeRecurringPaymentOccurrence: {
        findFirst: jest.fn().mockResolvedValue(occurrence()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      financeRecurringPaymentRevision: {
        create: jest.fn().mockResolvedValue({}),
      },
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue(obligationProfile),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const deliveries = {
      replace: jest.fn().mockResolvedValue({
        scheduledAt: updated.nextOccurrenceAt,
      }),
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FinanceRegularPaymentConfirmationService(
      prisma as never,
      {} as never,
      deliveries as never,
    );

    await expect(
      service.applyFutureAmount('profile-1', 'regular-1', 'occurrence-1', {
        expectedVersion: 3,
      }),
    ).resolves.toMatchObject({ amount: '900', version: 4 });
    expect(tx.financeRecurringPayment.updateMany).toHaveBeenCalledWith({
      where: { id: 'regular-1', profileId: 'profile-1', version: 3 },
      data: {
        amount: new Prisma.Decimal(900),
        version: { increment: 1 },
      },
    });
    expect(tx.financeRecurringPaymentRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'AMOUNT_APPLIED',
        amount: new Prisma.Decimal(900),
        version: 4,
      }),
    });
    expect(deliveries.replace).toHaveBeenCalledWith(
      tx,
      obligationProfile,
      updated,
    );
    expect(deliveries.reschedule).toHaveBeenCalledWith(
      updated.nextOccurrenceAt,
    );
  });
});
