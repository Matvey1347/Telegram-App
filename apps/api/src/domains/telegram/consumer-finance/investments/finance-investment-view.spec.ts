import { Prisma } from '@prisma/client';
import { financeInvestmentView } from './finance-investment-view';

function row(invested: string, returned: string, value: string) {
  const now = new Date('2026-09-08T00:00:00.000Z');
  return {
    id: 'investment-1',
    name: 'Business',
    description: null,
    type: 'BUSINESS' as const,
    currency: 'USD',
    status: 'ACTIVE' as const,
    startedAt: now,
    closedAt: null,
    archivedAt: null,
    totalInvested: new Prisma.Decimal(invested),
    totalReturned: new Prisma.Decimal(returned),
    currentValue: new Prisma.Decimal(value),
    currentValuationAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe('financeInvestmentView', () => {
  it('calculates P&L and return percentage without treating returns as income', () => {
    expect(financeInvestmentView(row('1000', '200', '900'))).toMatchObject({
      profitLoss: '100',
      returnPercentage: 10,
    });
  });

  it('returns a null percentage when no capital was invested', () => {
    expect(financeInvestmentView(row('0', '50', '0'))).toMatchObject({
      profitLoss: '50',
      returnPercentage: null,
    });
  });
});
