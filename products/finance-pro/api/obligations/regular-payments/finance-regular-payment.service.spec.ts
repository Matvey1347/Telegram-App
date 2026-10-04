import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinanceRegularPaymentService } from './finance-regular-payment.service';

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
    nextOccurrenceAt: new Date('2026-08-31T00:00:00.000Z'),
    scheduleTimezone: 'UTC',
    note: null,
    status: 'ACTIVE' as const,
    version: 1,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

const profile = {
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

const input = {
  name: 'Rent',
  amount: '1000',
  accountId: account.id,
  categoryId: category.id,
  recurrence: 'MONTHLY' as const,
  nextPaymentDate: '2026-08-31',
  note: null,
};

describe('FinanceRegularPaymentService', () => {
  it('rejects a whitespace-only name before account or row writes', async () => {
    const tx = {
      financeProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
      financeAccount: { findFirst: jest.fn() },
      financeRecurringPayment: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    await expect(
      new FinanceRegularPaymentService(prisma as never, {} as never).create(
        'profile-1',
        { ...input, name: '  ' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.financeAccount.findFirst).not.toHaveBeenCalled();
    expect(tx.financeRecurringPayment.create).not.toHaveBeenCalled();
  });

  it('creates the first immutable revision and atomic due delivery', async () => {
    const row = regular();
    const tx = {
      financeProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: account.id, currency: 'USD' }),
      },
      financeCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: category.id }),
      },
      financeRecurringPayment: { create: jest.fn().mockResolvedValue(row) },
      financeRecurringPaymentRevision: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const deliveries = {
      schedule: jest
        .fn()
        .mockResolvedValue({ scheduledAt: row.nextOccurrenceAt }),
      notify: jest.fn(),
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FinanceRegularPaymentService(
      prisma as never,
      deliveries as never,
    );

    await expect(service.create('profile-1', input)).resolves.toMatchObject({
      id: 'regular-1',
      currency: 'USD',
      recurrence: 'MONTHLY',
    });
    expect(tx.financeRecurringPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileId: 'profile-1',
          currency: 'USD',
          anchorDay: 31,
        }),
      }),
    );
    expect(tx.financeRecurringPaymentRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recurringPaymentId: 'regular-1',
        version: 1,
        kind: 'CREATED',
      }),
    });
    expect(deliveries.schedule).toHaveBeenCalledWith(tx, profile, row);
    expect(deliveries.notify).toHaveBeenCalledWith(row.nextOccurrenceAt);
    expect(deliveries.reschedule).not.toHaveBeenCalled();
  });

  it('makes a no-op edit produce zero history and delivery writes', async () => {
    const row = regular();
    const tx = {
      financeRecurringPayment: {
        findFirst: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn(),
      },
      financeProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: account.id, currency: 'USD' }),
      },
      financeCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: category.id }),
      },
      financeRecurringPaymentRevision: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const deliveries = {
      replace: jest.fn(),
      notify: jest.fn(),
      reschedule: jest.fn(),
    };
    const service = new FinanceRegularPaymentService(
      prisma as never,
      deliveries as never,
    );

    await service.update('profile-1', 'regular-1', input);

    expect(tx.financeRecurringPayment.updateMany).not.toHaveBeenCalled();
    expect(tx.financeRecurringPaymentRevision.create).not.toHaveBeenCalled();
    expect(deliveries.replace).not.toHaveBeenCalled();
    expect(deliveries.reschedule).not.toHaveBeenCalled();
  });

  it('records one revision for a real amount and anchor-day edit', async () => {
    const existing = regular({
      amount: new Prisma.Decimal(100),
      anchorDay: 1,
      nextOccurrenceAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    const updated = regular({
      amount: new Prisma.Decimal(400),
      anchorDay: 15,
      nextOccurrenceAt: new Date('2026-09-15T00:00:00.000Z'),
      version: 2,
    });
    const tx = {
      financeRecurringPayment: {
        findFirst: jest.fn().mockResolvedValue(existing),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue(profile),
      },
      financeAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: account.id, currency: 'USD' }),
      },
      financeCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: category.id }),
      },
      financeRecurringPaymentRevision: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const deliveries = {
      replace: jest.fn().mockResolvedValue({
        scheduledAt: updated.nextOccurrenceAt,
      }),
      notify: jest.fn(),
      reschedule: jest.fn().mockResolvedValue(undefined),
    };
    const service = new FinanceRegularPaymentService(
      prisma as never,
      deliveries as never,
    );

    await service.update('profile-1', 'regular-1', {
      ...input,
      amount: '400',
      nextPaymentDate: '2026-09-15',
    });

    expect(tx.financeRecurringPayment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: new Prisma.Decimal(400),
          anchorDay: 15,
          version: { increment: 1 },
        }),
      }),
    );
    expect(tx.financeRecurringPaymentRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'UPDATED',
        amount: new Prisma.Decimal(400),
        anchorDay: 15,
        version: 2,
      }),
    });
    expect(deliveries.replace).toHaveBeenCalledWith(tx, profile, updated);
    expect(deliveries.reschedule).toHaveBeenCalledWith(
      updated.nextOccurrenceAt,
    );
  });

  it.each([
    ['account', { account: null, category: { id: category.id } }],
    [
      'category',
      { account: { id: account.id, currency: 'USD' }, category: null },
    ],
  ] as const)('rejects a foreign %s reference', async (_kind, references) => {
    const tx = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue(profile),
      },
      financeAccount: {
        findFirst: jest.fn().mockResolvedValue(references.account),
      },
      financeCategory: {
        findFirst: jest.fn().mockResolvedValue(references.category),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    await expect(
      new FinanceRegularPaymentService(prisma as never, {} as never).create(
        'profile-1',
        input,
      ),
    ).rejects.toThrow(
      references.account
        ? 'Finance expense category not found'
        : 'Finance account not found',
    );
    expect(tx.financeAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ profileId: 'profile-1' }),
      }),
    );
    expect(tx.financeCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          profileId: 'profile-1',
          type: 'EXPENSE',
        }),
      }),
    );
  });

  it.each([
    ['PAUSED', 'PAUSED'],
    ['ACTIVE', 'RESUMED'],
    ['CANCELED', 'CANCELED'],
  ] as const)(
    'appends one %s status revision for a real transition',
    async (nextStatus, kind) => {
      const existing = regular({
        status: nextStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
      });
      const updated = regular({ status: nextStatus, version: 2 });
      const tx = {
        financeRecurringPayment: {
          findFirst: jest.fn().mockResolvedValue(existing),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
        },
        financeProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
        financeRecurringPaymentRevision: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
      const deliveries = {
        replace: jest.fn().mockResolvedValue(null),
        notify: jest.fn(),
        reschedule: jest.fn().mockResolvedValue(undefined),
      };
      const service = new FinanceRegularPaymentService(
        prisma as never,
        deliveries as never,
      );

      await service.changeStatus('profile-1', 'regular-1', nextStatus);

      expect(tx.financeRecurringPaymentRevision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind, version: 2, status: nextStatus }),
      });
      expect(deliveries.replace).toHaveBeenCalledWith(tx, profile, updated);
      expect(deliveries.reschedule).toHaveBeenCalledWith();
    },
  );

  it('keeps list reads bounded and profile scoped', async () => {
    const prisma = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      financeRecurringPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new FinanceRegularPaymentService(
      prisma as never,
      {} as never,
    );
    await service.list('profile-1', { status: 'ACTIVE', limit: 25 });
    expect(prisma.financeRecurringPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId: 'profile-1', status: 'ACTIVE' },
        take: 26,
      }),
    );

    await service.list('profile-1', {
      id: 'regular-101',
      status: 'ACTIVE',
      limit: 1,
    });
    expect(prisma.financeRecurringPayment.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: 'regular-101',
          profileId: 'profile-1',
          status: 'ACTIVE',
        },
        take: 2,
      }),
    );
  });
});
