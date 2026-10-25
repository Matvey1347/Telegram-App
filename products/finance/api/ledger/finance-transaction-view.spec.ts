import { Prisma } from '@prisma/client';
import { financeTransactionView } from '@consumer-finance/api/ledger/finance-transaction-view';

describe('financeTransactionView', () => {
  const transaction = {
    id: 'transaction-1',
    accountId: 'account-1',
    categoryId: null,
    type: 'EXPENSE',
    purpose: 'ORDINARY',
    amount: new Prisma.Decimal(25),
    economicAmount: new Prisma.Decimal(25),
    currency: 'PLN',
    necessity: 'UNSPECIFIED',
    valuationCurrency: null,
    amountInValuationCurrency: null,
    exchangeRateToValuation: null,
    valuationRateAt: null,
    occurredAt: new Date('2026-10-03T10:00:00Z'),
    description: 'Subscription',
    merchantDisplay: null,
    merchantNormalized: null,
    source: 'MINI_APP',
    deletedAt: null,
    account: null,
    category: null,
    _count: { items: 0 },
  } as const;

  it('includes the linked recurring payment in history rows', () => {
    const result = financeTransactionView({
      ...transaction,
      recurringPaymentOccurrence: { recurringPaymentId: 'payment-1' },
    } as Parameters<typeof financeTransactionView>[0]);
    expect(result.recurringPaymentId).toBe('payment-1');
    expect(result.economicAmount).toBe('25');
  });

  it('keeps one-off operations unlinked', () => {
    const result = financeTransactionView({
      ...transaction,
      recurringPaymentOccurrence: null,
    } as Parameters<typeof financeTransactionView>[0]);
    expect(result.recurringPaymentId).toBeNull();
  });
});
