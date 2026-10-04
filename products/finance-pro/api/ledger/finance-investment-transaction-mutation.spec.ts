import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  removeLinkedInvestmentTransaction,
  syncLinkedInvestmentEdit,
  type LinkedInvestmentTransaction,
} from './finance-investment-transaction-mutation';

const linked = (): LinkedInvestmentTransaction => ({
  id: 'transaction-1',
  profileId: 'profile-1',
  accountId: 'account-1',
  categoryId: null,
  merchantDisplay: null,
  currency: 'PLN',
  occurredAt: new Date('2026-09-19T12:00:00Z'),
  amountInValuationCurrency: new Prisma.Decimal('25'),
  investmentCashFlow: {
    id: 'cash-flow-1',
    investmentId: 'investment-1',
    kind: 'CONTRIBUTION',
    amountInInvestmentCurrency: new Prisma.Decimal('100'),
    exchangeRateToInvestment: new Prisma.Decimal('1'),
  },
});

describe('linked investment transaction mutations', () => {
  it('updates the source cash flow and investment totals with an edited transaction', async () => {
    const tx: any = {
      financeInvestment: {
        findFirst: jest.fn().mockResolvedValue({
          startedAt: new Date('2026-01-01T00:00:00Z'),
          closedAt: null,
          status: 'ACTIVE',
          currency: 'PLN',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      financeInvestmentCashFlow: { update: jest.fn().mockResolvedValue({}) },
    };
    await syncLinkedInvestmentEdit(tx, linked(), {
      amount: '120',
      currency: 'PLN',
      accountId: 'account-2',
      occurredAt: new Date('2026-09-20T12:00:00Z'),
      description: 'Edited contribution',
      valuationSnapshot: { amount: '30' },
    });
    expect(tx.financeInvestmentCashFlow.update).toHaveBeenCalledWith({
      where: { id: 'cash-flow-1' },
      data: expect.objectContaining({
        accountId: 'account-2',
        amountInInvestmentCurrency: new Prisma.Decimal('120'),
      }),
    });
    expect(tx.financeInvestment.update).toHaveBeenCalledWith({
      where: { id: 'investment-1' },
      data: expect.objectContaining({
        totalInvested: { increment: new Prisma.Decimal('20') },
        totalInvestedInValuationCurrency: { increment: new Prisma.Decimal('5') },
      }),
    });
  });

  it('rejects a date change that would leave a converted investment rate stale', async () => {
    const tx: any = {
      financeInvestment: {
        findFirst: jest.fn().mockResolvedValue({
          startedAt: new Date('2026-01-01T00:00:00Z'),
          closedAt: null,
          status: 'ACTIVE',
          currency: 'USD',
        }),
        update: jest.fn(),
      },
      financeInvestmentCashFlow: { update: jest.fn() },
    };
    await expect(syncLinkedInvestmentEdit(tx, linked(), {
      amount: '120', currency: 'PLN', accountId: 'account-1',
      occurredAt: new Date('2026-09-20T12:00:00Z'),
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.financeInvestmentCashFlow.update).not.toHaveBeenCalled();
  });

  it('removes the cash flow and transaction together and reverses investment totals', async () => {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      financeInvestmentCashFlow: { delete: jest.fn().mockResolvedValue({}) },
      financeTransaction: {
        findFirst: jest.fn().mockResolvedValue(linked()),
        update: jest.fn().mockResolvedValue({}),
      },
      financeInvestment: { update: jest.fn().mockResolvedValue({}) },
    };
    await expect(removeLinkedInvestmentTransaction(tx, linked())).resolves.toEqual({
      deleted: true, undoable: false,
    });
    expect(tx.financeInvestmentCashFlow.delete).toHaveBeenCalledWith({ where: { id: 'cash-flow-1' } });
    expect(tx.financeTransaction.update).toHaveBeenCalledWith({
      where: { id: 'transaction-1' }, data: { deletedAt: expect.any(Date) },
    });
    expect(tx.financeInvestment.update).toHaveBeenCalledWith({
      where: { id: 'investment-1' },
      data: expect.objectContaining({
        totalInvested: { decrement: new Prisma.Decimal('100') },
        totalInvestedInValuationCurrency: { decrement: new Prisma.Decimal('25') },
      }),
    });
  });
});
