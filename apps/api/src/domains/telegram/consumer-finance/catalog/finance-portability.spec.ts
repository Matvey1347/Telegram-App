import { Prisma } from '@prisma/client';
import { validateFinanceImportDocument } from '../portability/finance-import-validator';
import { exportFinanceData } from './finance-portability';

const empty = () => ({ findMany: jest.fn().mockResolvedValue([]) });

describe('exportFinanceData', () => {
  it('produces an import-v1 document and excludes generated investment transactions', async () => {
    const models = {
      financeProfile: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          displayName: 'Personal finance',
          defaultCurrency: 'UAH',
          timezone: 'Europe/Kyiv',
          locale: 'uk',
        }),
      },
      financeAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-1',
            name: 'Cash',
            emoji: '💵',
            type: 'CASH',
            currency: 'UAH',
            openingBalance: new Prisma.Decimal(10),
            archivedAt: null,
          },
        ]),
      },
      financeCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'category-1',
            parentId: null,
            name: 'Food',
            emoji: '🍽️',
            type: 'EXPENSE',
            necessity: 'DISCRETIONARY',
            key: null,
            archivedAt: null,
          },
        ]),
      },
      financeTransaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'transaction-1',
            accountId: 'account-1',
            categoryId: 'category-1',
            type: 'EXPENSE',
            amount: new Prisma.Decimal('2.50'),
            occurredAt: new Date('2026-09-08T09:00:00.000Z'),
            description: 'Coffee',
            merchantDisplay: null,
            items: [],
          },
        ]),
      },
      financeTransfer: empty(),
      financeSpendingLimit: empty(),
      financeReminder: empty(),
      financeSavingsGoal: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'goal-1',
            name: 'Reserve',
            targetAmount: new Prisma.Decimal(1000),
            legacyUnlinkedAmount: new Prisma.Decimal(25),
            currency: 'UAH',
            targetDate: null,
            note: null,
            status: 'ACTIVE',
          },
        ]),
      },
      financeSavingsMovement: empty(),
      financeInvestment: empty(),
      financeInvestmentCashFlow: empty(),
      financeInvestmentValuation: empty(),
      financeDebt: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'debt-1',
            accountId: 'account-1',
            settlementTransactionId: 'transaction-1',
            direction: 'I_OWE',
            status: 'SETTLED',
            name: 'Coffee debt',
            amount: new Prisma.Decimal('2.5'),
            dueAt: new Date('2026-09-08T08:00:00.000Z'),
            scheduleTimezone: 'Europe/Kyiv',
            note: null,
            settledAt: new Date('2026-09-08T09:00:00.000Z'),
          },
        ]),
      },
      financeRecurringPayment: empty(),
      financeDataExportReceipt: {
        create: jest.fn().mockResolvedValue({ id: 'export-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
    };
    const prisma = {
      ...models,
      $transaction: jest.fn((action: (tx: typeof models) => unknown) =>
        action(models),
      ),
    };

    const result = await exportFinanceData(prisma as never, 'profile-1');

    expect(validateFinanceImportDocument(result)).toBe(result);
    expect(result).toMatchObject({
      format: 'telegram-system.consumer-finance',
      version: 1,
      mode: 'ADD',
      settings: { displayName: 'Personal finance' },
      data: {
        accounts: [{ ref: 'account-1', openingBalance: '10' }],
        categories: [{ ref: 'category-1', necessity: 'DISCRETIONARY' }],
        transactions: [{ ref: 'transaction-1', amount: '2.5' }],
        savingsGoals: [{ ref: 'goal-1', initialAmount: '25' }],
        debts: [
          {
            ref: 'debt-1',
            settlementTransactionRef: 'transaction-1',
          },
        ],
      },
    });
    expect(prisma.financeTransaction.findMany).toHaveBeenCalledWith({
      where: {
        profileId: 'profile-1',
        deletedAt: null,
        purpose: {
          notIn: ['INVESTMENT_CONTRIBUTION', 'INVESTMENT_RETURN'],
        },
      },
      include: {
        items: true,
        recurringPaymentOccurrence: { select: { recurringPaymentId: true } },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 30_000,
    });
    expect(models.financeDataExportReceipt.create).toHaveBeenCalledWith({
      data: {
        profileId: 'profile-1',
        formatVersion: 1,
        exportedCount: 5,
        counts: {
          accounts: 1,
          categories: 1,
          transactions: 1,
          savingsGoals: 1,
          debts: 1,
        },
      },
    });
  });
});
