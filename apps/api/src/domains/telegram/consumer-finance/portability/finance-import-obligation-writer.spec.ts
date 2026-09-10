import type { ConsumerFinanceImportDocumentV1 } from '@telegram-system/shared';
import { writeFinanceObligationImport } from './finance-import-obligation-writer';

function document(statuses?: {
  reminder?: boolean;
  debt?: 'OPEN' | 'SETTLED';
  regular?: 'ACTIVE' | 'PAUSED';
}) {
  return {
    format: 'telegram-system.consumer-finance',
    version: 1,
    mode: 'ADD',
    data: {
      accounts: [{ ref: 'cash', name: 'Cash', type: 'CASH', currency: 'UAH' }],
      categories: [{ ref: 'rent', name: 'Rent', type: 'EXPENSE', key: null }],
      transactions:
        statuses?.debt === 'SETTLED'
          ? [
              {
                ref: 'settlement',
                accountRef: 'cash',
                type: 'EXPENSE',
                amount: '50',
                occurredAt: '2026-09-01T00:00:00.000Z',
              },
            ]
          : [],
      reminders: [
        {
          ref: 'reminder',
          name: 'Rent',
          amount: '500',
          currency: 'UAH',
          dayOfMonth: 1,
          nextOccurrenceAt: '2026-10-01T09:00:00.000Z',
          enabled: statuses?.reminder ?? true,
        },
      ],
      debts: [
        {
          ref: 'debt',
          accountRef: 'cash',
          direction: 'I_OWE',
          status: statuses?.debt ?? 'OPEN',
          name: 'Alex',
          amount: '50',
          dueAt: '2026-10-02T09:00:00.000Z',
          scheduleTimezone: 'Europe/Kyiv',
          ...(statuses?.debt === 'SETTLED'
            ? {
                settledAt: '2026-09-01T00:00:00.000Z',
                settlementTransactionRef: 'settlement',
              }
            : {}),
        },
      ],
      regularPayments: [
        {
          ref: 'regular',
          accountRef: 'cash',
          categoryRef: 'rent',
          name: 'Subscription',
          amount: '100',
          recurrence: 'MONTHLY',
          nextOccurrenceAt: '2026-10-03T09:00:00.000Z',
          scheduleTimezone: 'Europe/Kyiv',
          status: statuses?.regular ?? 'ACTIVE',
        },
      ],
    },
  } satisfies ConsumerFinanceImportDocumentV1;
}

function setup() {
  const tx = {
    financeProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'profile-1',
        defaultCurrency: 'UAH',
        timezone: 'Europe/Kyiv',
        locale: 'uk',
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'user-1',
        botIntegration: { workspaceId: 'workspace-1' },
        telegramUser: {
          telegramChatId: '42',
          runtimeInstanceId: 'runtime-1',
          languageCode: 'uk',
        },
      }),
    },
    financeReminder: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    financeDebt: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    financeRecurringPayment: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    financeRecurringPaymentRevision: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const delivery = {
    enqueueManyInTransaction: jest
      .fn()
      .mockImplementation((_tx: unknown, rows: Array<{ scheduledAt: Date }>) =>
        Promise.resolve(rows.map(({ scheduledAt }) => ({ scheduledAt }))),
      ),
  };
  const presentation = {
    debtDue: jest.fn().mockReturnValue({ text: 'Debt due' }),
    regularPaymentDue: jest.fn().mockReturnValue({ text: 'Payment due' }),
  };
  return { tx, delivery, presentation };
}

describe('writeFinanceObligationImport', () => {
  it('creates durable deliveries for imported active obligations', async () => {
    const test = setup();

    const result = await writeFinanceObligationImport({
      tx: test.tx as never,
      profileId: 'profile-1',
      document: document(),
      accountIds: new Map([['cash', 'account-1']]),
      categoryIds: new Map([['rent', 'category-1']]),
      transactionIds: new Map(),
      delivery: test.delivery as never,
      presentation: test.presentation,
      onProgress: jest.fn(),
      signal: new AbortController().signal,
    });

    expect(result.counts).toEqual({
      reminders: 1,
      debts: 1,
      regularPayments: 1,
    });
    expect(test.delivery.enqueueManyInTransaction).toHaveBeenCalledTimes(3);
    const calls = test.delivery.enqueueManyInTransaction.mock
      .calls as unknown as Array<
      [
        unknown,
        Array<{
          financeReminderId?: string;
          financeDebtId?: string;
          financeRecurringPaymentId?: string;
        }>,
      ]
    >;
    expect(calls[0]?.[0]).toBe(test.tx);
    expect(typeof calls[0]?.[1][0].financeReminderId).toBe('string');
    expect(typeof calls[1]?.[1][0].financeDebtId).toBe('string');
    expect(typeof calls[2]?.[1][0].financeRecurringPaymentId).toBe('string');
  });

  it('does not schedule disabled, settled or paused rows', async () => {
    const test = setup();

    await writeFinanceObligationImport({
      tx: test.tx as never,
      profileId: 'profile-1',
      document: document({
        reminder: false,
        debt: 'SETTLED',
        regular: 'PAUSED',
      }),
      accountIds: new Map([['cash', 'account-1']]),
      categoryIds: new Map([['rent', 'category-1']]),
      transactionIds: new Map([['settlement', 'transaction-1']]),
      delivery: test.delivery as never,
      presentation: test.presentation,
      onProgress: jest.fn(),
      signal: new AbortController().signal,
    });

    expect(test.delivery.enqueueManyInTransaction).not.toHaveBeenCalled();
    expect(test.tx.financeDebt.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          status: 'SETTLED',
          settlementTransactionId: 'transaction-1',
        }),
      ],
    });
  });

  it('stops between batches when the request is aborted', async () => {
    const test = setup();
    const controller = new AbortController();
    const many = document();
    many.data.reminders = Array.from({ length: 251 }, (_, index) => ({
      ...many.data.reminders[0],
      ref: `reminder-${index}`,
    }));
    test.tx.financeReminder.createMany.mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({ count: 250 });
    });

    await expect(
      writeFinanceObligationImport({
        tx: test.tx as never,
        profileId: 'profile-1',
        document: many,
        accountIds: new Map([['cash', 'account-1']]),
        categoryIds: new Map([['rent', 'category-1']]),
        transactionIds: new Map(),
        delivery: test.delivery as never,
        presentation: test.presentation,
        onProgress: jest.fn(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(test.tx.financeReminder.createMany).toHaveBeenCalledTimes(1);
  });
});
