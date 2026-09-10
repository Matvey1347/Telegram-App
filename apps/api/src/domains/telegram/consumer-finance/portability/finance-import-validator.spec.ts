import { BadRequestException } from '@nestjs/common';
import type { ConsumerFinanceImportDocumentV1 } from '@telegram-system/shared';
import { validateFinanceImportDocument } from './finance-import-validator';

function completeDocument(): ConsumerFinanceImportDocumentV1 {
  return {
    format: 'telegram-system.consumer-finance',
    version: 1,
    mode: 'ADD',
    settings: {
      displayName: 'Personal finance',
      defaultCurrency: 'UAH',
      timezone: 'Europe/Kyiv',
      locale: 'uk',
    },
    data: {
      accounts: [
        {
          ref: 'cash',
          name: 'Cash',
          type: 'CASH',
          currency: 'UAH',
          openingBalance: '-5',
        },
        { ref: 'card', name: 'Card', type: 'CARD', currency: 'UAH' },
      ],
      categories: [
        { ref: 'food', name: 'Food', type: 'EXPENSE' },
        {
          ref: 'coffee',
          parentRef: 'food',
          name: 'Coffee',
          type: 'EXPENSE',
        },
        { ref: 'salary', name: 'Salary', type: 'INCOME' },
      ],
      transactions: [
        {
          ref: 'coffee-1',
          accountRef: 'cash',
          categoryRef: 'coffee',
          type: 'EXPENSE',
          amount: '85.50',
          occurredAt: '2026-09-08T09:30:00.000Z',
          items: [{ displayName: 'Latte', totalAmount: '85.50' }],
        },
      ],
      transfers: [
        {
          ref: 'cash-to-card',
          fromAccountRef: 'cash',
          toAccountRef: 'card',
          fromAmount: '100',
          toAmount: '100',
          occurredAt: '2026-09-08T10:00:00.000Z',
        },
      ],
      limits: [
        {
          ref: 'food-limit',
          categoryRef: 'food',
          amount: '5000',
          currency: 'UAH',
        },
      ],
      reminders: [
        {
          ref: 'rent-reminder',
          name: 'Rent',
          amount: '10000',
          currency: 'UAH',
          dayOfMonth: 1,
          reminderOffsetMinutes: 60,
          nextOccurrenceAt: '2026-10-01T09:00:00.000Z',
        },
      ],
      debts: [
        {
          ref: 'alex-debt',
          accountRef: 'card',
          direction: 'I_OWE',
          name: 'Alex',
          amount: '300',
          dueAt: '2026-10-03T09:00:00.000Z',
          scheduleTimezone: 'Europe/Kyiv',
        },
      ],
      regularPayments: [
        {
          ref: 'subscription',
          accountRef: 'card',
          categoryRef: 'food',
          name: 'Subscription',
          amount: '200',
          recurrence: 'MONTHLY',
          nextOccurrenceAt: '2026-10-05T09:00:00.000Z',
          scheduleTimezone: 'Europe/Kyiv',
        },
      ],
      savingsGoals: [
        {
          ref: 'reserve',
          name: 'Reserve',
          targetAmount: '10000',
          currency: 'UAH',
        },
      ],
      savingsMovements: [
        {
          ref: 'reserve-allocation',
          accountRef: 'card',
          toGoalRef: 'reserve',
          kind: 'ALLOCATE',
          amount: '100',
          occurredAt: '2026-09-08T11:00:00.000Z',
        },
      ],
      investments: [
        {
          ref: 'company',
          name: 'Company',
          type: 'BUSINESS',
          currency: 'UAH',
          startedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      investmentCashFlows: [
        {
          ref: 'company-contribution',
          investmentRef: 'company',
          accountRef: 'card',
          kind: 'CONTRIBUTION',
          amount: '1000',
          occurredAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      investmentValuations: [
        {
          ref: 'company-value',
          investmentRef: 'company',
          value: '1200',
          valuedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    },
  };
}

function errorPath(input: unknown) {
  try {
    validateFinanceImportDocument(input);
    throw new Error('Expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as { path: string };
  }
}

describe('validateFinanceImportDocument', () => {
  it('accepts one document containing every supported Finance section', () => {
    const document = completeDocument();

    expect(validateFinanceImportDocument(document)).toBe(document);
  });

  it('rejects unknown fields instead of silently losing imported data', () => {
    const document = completeDocument() as ConsumerFinanceImportDocumentV1 & {
      surprise?: boolean;
    };
    document.surprise = true;

    expect(errorPath(document).path).toBe('$.surprise');
  });

  it('rejects invalid optional text and oversized nested item collections', () => {
    const invalidText = completeDocument();
    invalidText.data.transactions![0].description = 42 as never;
    expect(errorPath(invalidText).path).toBe(
      'data.transactions[0].description',
    );

    const tooManyItems = completeDocument();
    tooManyItems.data.transactions![0].items = Array.from(
      { length: 101 },
      (_, index) => ({ displayName: `Item ${index}`, totalAmount: '1' }),
    );
    expect(errorPath(tooManyItems).path).toBe('data.transactions[0].items');
  });

  it('rejects a dangling cross-section reference', () => {
    const document = completeDocument();
    document.data.transactions![0].accountRef = 'missing';

    expect(errorPath(document).path).toBe('data.transactions[0].accountRef');
  });

  it('requires settled debts to link their matching ledger transaction', () => {
    const document = completeDocument();
    document.data.debts![0].status = 'SETTLED';
    document.data.debts![0].settledAt = '2026-09-08T12:00:00.000Z';
    expect(errorPath(document).path).toBe('data.debts[0]');

    document.data.transactions!.push({
      ref: 'debt-settlement',
      accountRef: 'card',
      type: 'EXPENSE',
      amount: '300',
      occurredAt: '2026-09-08T12:00:00.000Z',
    });
    document.data.debts![0].settlementTransactionRef = 'debt-settlement';
    expect(validateFinanceImportDocument(document)).toBe(document);
  });

  it('validates item categories and linked savings transfers', () => {
    const item = completeDocument();
    item.data.transactions![0].items![0].categoryRef = 'salary';
    expect(errorPath(item).path).toBe(
      'data.transactions[0].items[0].categoryRef',
    );

    const linked = completeDocument();
    linked.data.savingsMovements![0].linkedTransferRef = 'cash-to-card';
    linked.data.savingsMovements!.push({
      ...linked.data.savingsMovements![0],
      ref: 'duplicate-transfer-link',
    });
    expect(errorPath(linked).path).toBe('data.savingsMovements');
  });

  it('rejects category and valuation cycles', () => {
    const categoryCycle = completeDocument();
    categoryCycle.data.categories![0].parentRef = 'coffee';
    expect(errorPath(categoryCycle).path).toContain('parentRef');

    const valuationCycle = completeDocument();
    valuationCycle.data.investmentValuations!.push({
      ref: 'company-value-2',
      investmentRef: 'company',
      value: '1300',
      valuedAt: '2026-09-02T00:00:00.000Z',
      correctsRef: 'company-value',
    });
    valuationCycle.data.investmentValuations![0].correctsRef =
      'company-value-2';
    expect(errorPath(valuationCycle).path).toContain('correctsRef');
  });

  it('rejects pre-investment history and correction branching', () => {
    const history = completeDocument();
    history.data.investmentCashFlows![0].occurredAt =
      '2025-12-31T23:59:59.000Z';
    expect(errorPath(history).path).toBe(
      'data.investmentCashFlows[0].occurredAt',
    );

    const branching = completeDocument();
    branching.data.investmentValuations!.push(
      {
        ref: 'correction-1',
        investmentRef: 'company',
        value: '1250',
        valuedAt: '2026-09-02T00:00:00.000Z',
        correctsRef: 'company-value',
      },
      {
        ref: 'correction-2',
        investmentRef: 'company',
        value: '1275',
        valuedAt: '2026-09-03T00:00:00.000Z',
        correctsRef: 'company-value',
      },
    );
    expect(errorPath(branching).path).toBe('data.investmentValuations');
  });

  it('enforces investment closing state and timeline boundaries', () => {
    const closedWithoutDate = completeDocument();
    closedWithoutDate.data.investments![0].status = 'CLOSED';
    expect(errorPath(closedWithoutDate).path).toBe(
      'data.investments[0].closedAt',
    );

    const activeWithDate = completeDocument();
    activeWithDate.data.investments![0].closedAt = '2026-09-02T00:00:00.000Z';
    expect(errorPath(activeWithDate).path).toBe('data.investments[0].closedAt');

    const cashFlowAfterClose = completeDocument();
    cashFlowAfterClose.data.investments![0].status = 'CLOSED';
    cashFlowAfterClose.data.investments![0].closedAt =
      '2026-09-01T12:00:00.000Z';
    cashFlowAfterClose.data.investmentCashFlows![0].occurredAt =
      '2026-09-02T00:00:00.000Z';
    expect(errorPath(cashFlowAfterClose).path).toBe(
      'data.investmentCashFlows[0].occurredAt',
    );

    const valuationAfterClose = completeDocument();
    valuationAfterClose.data.investments![0].status = 'CLOSED';
    valuationAfterClose.data.investments![0].closedAt =
      '2026-09-01T12:00:00.000Z';
    valuationAfterClose.data.investmentValuations![0].valuedAt =
      '2026-09-02T00:00:00.000Z';
    expect(errorPath(valuationAfterClose).path).toBe(
      'data.investmentValuations[0].valuedAt',
    );
  });

  it('rejects an invalid timezone and a negative savings allocation', () => {
    const timezone = completeDocument();
    timezone.data.debts![0].scheduleTimezone = 'Not/AZone';
    expect(errorPath(timezone).path).toBe('data.debts[0].scheduleTimezone');

    const savings = completeDocument();
    savings.data.savingsMovements![0] = {
      ref: 'release',
      accountRef: 'card',
      fromGoalRef: 'reserve',
      kind: 'RELEASE',
      amount: '1',
      occurredAt: '2026-09-08T11:00:00.000Z',
    };
    expect(errorPath(savings).path).toBe('data.savingsMovements[0].amount');
  });

  it('validates linked savings movements in time order', () => {
    const document = completeDocument();
    document.data.savingsGoals![0].initialAmount = '50';
    document.data.savingsMovements = [
      {
        ref: 'later-allocation',
        accountRef: 'card',
        toGoalRef: 'reserve',
        kind: 'ALLOCATE',
        amount: '100',
        occurredAt: '2026-09-09T11:00:00.000Z',
      },
      {
        ref: 'early-release',
        accountRef: 'card',
        fromGoalRef: 'reserve',
        kind: 'RELEASE',
        amount: '75',
        occurredAt: '2026-09-08T11:00:00.000Z',
      },
    ];

    expect(errorPath(document).path).toBe('data.savingsMovements[1].amount');

    document.data.savingsMovements[0].occurredAt = '2026-09-07T11:00:00.000Z';
    expect(validateFinanceImportDocument(document)).toBe(document);
  });
});
