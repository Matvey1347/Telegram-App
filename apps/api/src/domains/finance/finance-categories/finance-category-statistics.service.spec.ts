import { Prisma, TransactionType } from '@prisma/client';
import { FinanceCategoryStatisticsService } from './finance-category-statistics.service';

describe('FinanceCategoryStatisticsService', () => {
  it('returns equivalent category/currency totals from one bounded aggregate read', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          categoryId: 'category-1',
          categoryName: 'Sales',
          currency: 'USD',
          count: 2,
          amount: new Prisma.Decimal(30),
          amountInPrimaryCurrency: new Prisma.Decimal(30),
        },
        {
          categoryId: 'category-1',
          categoryName: 'Sales',
          currency: 'EUR',
          count: 1,
          amount: new Prisma.Decimal(10),
          amountInPrimaryCurrency: new Prisma.Decimal(12),
        },
        {
          categoryId: null,
          categoryName: 'Legacy',
          currency: 'USD',
          count: 1,
          amount: new Prisma.Decimal(5),
          amountInPrimaryCurrency: new Prisma.Decimal(5),
        },
      ]),
      transaction: { findMany: jest.fn() },
      transactionCategory: { findMany: jest.fn(), upsert: jest.fn() },
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('ws-1'),
    };
    const service = new FinanceCategoryStatisticsService(
      prisma as never,
      workspaceService as never,
    );

    await expect(
      service.statistics('user-1', TransactionType.income),
    ).resolves.toEqual({
      type: 'income',
      items: [
        {
          categoryId: 'category-1',
          categoryName: 'Sales',
          count: 3,
          totalInPrimaryCurrency: '42',
          currencies: [
            {
              currency: 'EUR',
              amount: '10',
              amountInPrimaryCurrency: '12',
            },
            {
              currency: 'USD',
              amount: '30',
              amountInPrimaryCurrency: '30',
            },
          ],
        },
        {
          categoryId: null,
          categoryName: 'Legacy',
          count: 1,
          totalInPrimaryCurrency: '5',
          currencies: [
            {
              currency: 'USD',
              amount: '5',
              amountInPrimaryCurrency: '5',
            },
          ],
        },
      ],
    });
    expect(workspaceService.resolveWorkspaceIdForUser).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(prisma.transactionCategory.findMany).not.toHaveBeenCalled();
    expect(prisma.transactionCategory.upsert).not.toHaveBeenCalled();
  });

  it('binds the authorized workspace and requested type into the aggregate query', async () => {
    const queryRaw = jest.fn((query: Prisma.Sql) => {
      void query;
      return Promise.resolve([]);
    });
    const prisma = { $queryRaw: queryRaw };
    const service = new FinanceCategoryStatisticsService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest
          .fn()
          .mockResolvedValue('workspace-safe'),
      } as never,
    );

    await service.statistics('user-1', TransactionType.expense);

    const query = queryRaw.mock.calls[0][0];
    expect(query.values).toEqual([
      'workspace-safe',
      'workspace-safe',
      TransactionType.expense,
    ]);
  });
});
