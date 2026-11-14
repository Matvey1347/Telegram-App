import { Prisma } from '@prisma/client';
import { refreshInvestmentCurrent } from './finance-investment-current';

describe('current investment value', () => {
  it('adds subsequent contributions and subtracts returns from the latest valuation', async () => {
    const date = new Date('2026-09-14T00:00:00Z');
    const tx = {
      financeInvestmentValuation: { findFirst: jest.fn().mockResolvedValue({ value: new Prisma.Decimal('12091'), amountInValuationCurrency: new Prisma.Decimal('3000'), valuedAt: date, createdAt: date }) },
      financeInvestmentCashFlow: { groupBy: jest.fn().mockResolvedValue([{ kind: 'CONTRIBUTION', _sum: { amountInInvestmentCurrency: new Prisma.Decimal('2444.33') } }, { kind: 'RETURN', _sum: { amountInInvestmentCurrency: new Prisma.Decimal('100') } }]) },
      financeTransaction: { groupBy: jest.fn().mockResolvedValue([{ type: 'EXPENSE', _sum: { amountInValuationCurrency: new Prisma.Decimal('600') } }, { type: 'INCOME', _sum: { amountInValuationCurrency: new Prisma.Decimal('25') } }]) },
      financeInvestment: { update: jest.fn() },
    };
    await refreshInvestmentCurrent(tx as never, 'profile', 'investment');
    expect(tx.financeInvestment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentValue: new Prisma.Decimal('14435.33'), currentValueInValuationCurrency: new Prisma.Decimal('3575'), currentValuationAt: date }) }));
    expect(tx.financeInvestmentCashFlow.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ profileId: 'profile', investmentId: 'investment', OR: expect.any(Array) }) }));
  });
  it('uses net cash flows when there is no valuation', async () => {
    const tx = { financeInvestmentValuation: { findFirst: jest.fn().mockResolvedValue(null) }, financeInvestmentCashFlow: { groupBy: jest.fn().mockResolvedValue([{ kind: 'CONTRIBUTION', _sum: { amountInInvestmentCurrency: new Prisma.Decimal('100') } }]) }, financeTransaction: { groupBy: jest.fn().mockResolvedValue([]) }, financeInvestment: { update: jest.fn() } };
    await refreshInvestmentCurrent(tx as never, 'profile', 'investment');
    expect(tx.financeInvestment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentValue: new Prisma.Decimal('100') }) }));
  });
});
