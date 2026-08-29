import { TransactionType } from '@prisma/client';
import { DashboardReadService } from './dashboard-read.service';

function prismaFixture(accountCount: number) {
  const accounts = Array.from({ length: accountCount }, (_, index) => ({
    id: `account-${index}`,
    name: `Account ${index}`,
    currency: 'USD',
    initialBalance: index === 0 ? 100 : 0,
    iconId: null,
    icon: null,
  }));
  const transactionGroupBy = jest.fn((args: { by: string[] }) => {
    if (args.by.includes('accountId')) {
      return Promise.resolve([
        {
          accountId: 'account-0',
          type: TransactionType.income,
          _sum: { amount: 50 },
        },
        {
          accountId: 'account-0',
          type: TransactionType.expense,
          _sum: { amount: 20 },
        },
      ]);
    }
    return Promise.resolve([]);
  });
  const transferGroupBy = jest.fn((args: { by: string[] }) =>
    Promise.resolve(
      args.by.includes('fromAccountId')
        ? [{ fromAccountId: 'account-0', _sum: { fromAmount: 10 } }]
        : [{ toAccountId: 'account-0', _sum: { toAmount: 5 } }],
    ),
  );
  const emptySum = () => ({ _sum: { amountInPrimaryCurrency: null } });
  return {
    workspace: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        primaryCurrency: 'USD',
        secondaryCurrency: 'UAH',
      }),
    },
    account: { findMany: jest.fn().mockResolvedValue(accounts) },
    transaction: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: transactionGroupBy,
      aggregate: jest.fn().mockImplementation(emptySum),
    },
    transactionCategory: { findMany: jest.fn().mockResolvedValue([]) },
    transfer: { groupBy: transferGroupBy },
    investment: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockImplementation(emptySum),
    },
    adCampaign: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    adHypothesis: { groupBy: jest.fn().mockResolvedValue([]) },
    workspaceMember: { count: jest.fn().mockResolvedValue(0) },
    telegramInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('DashboardReadService', () => {
  const from = new Date('2026-01-01T00:00:00');
  const to = new Date('2026-01-30T23:59:59.999');

  it('uses period-bounded row reads and preserves account transfer signs', async () => {
    const prisma = prismaFixture(1);
    const result = await new DashboardReadService(prisma as never).load(
      'workspace-1',
      from,
      to,
    );

    expect(result.accountRows[0].balance).toBe(125);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          deletedAt: null,
          date: { gte: from, lte: to },
        },
      }),
    );
    expect(prisma.investment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          date: { gte: from, lte: to },
        },
      }),
    );
    expect(prisma.adCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          OR: [
            { placementDate: { gte: from, lte: to } },
            {
              placementDate: null,
              startedAt: { gte: from, lte: to },
            },
            {
              placementDate: null,
              startedAt: null,
              createdAt: { gte: from, lte: to },
            },
          ],
        },
      }),
    );
  });

  it('keeps Prisma call counts constant from one to 100 accounts', async () => {
    const one = prismaFixture(1);
    const hundred = prismaFixture(100);

    await new DashboardReadService(one as never).load('workspace-1', from, to);
    await new DashboardReadService(hundred as never).load(
      'workspace-1',
      from,
      to,
    );

    for (const prisma of [one, hundred]) {
      expect(prisma.transaction.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.transaction.groupBy).toHaveBeenCalledTimes(3);
      expect(prisma.transaction.aggregate).toHaveBeenCalledTimes(3);
      expect(prisma.transfer.groupBy).toHaveBeenCalledTimes(2);
      expect(prisma.investment.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.investment.aggregate).toHaveBeenCalledTimes(2);
      expect(prisma.adCampaign.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.adCampaign.groupBy).toHaveBeenCalledTimes(1);
    }
    expect(one.account.findMany).toHaveBeenCalledTimes(1);
    expect(hundred.account.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps selected invite-link hydration inside the workspace', async () => {
    const prisma = prismaFixture(0);
    await new DashboardReadService(prisma as never).loadSelectedInviteLinks(
      'workspace-1',
      ['link-1'],
    );

    expect(prisma.telegramInviteLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', id: { in: ['link-1'] } },
      }),
    );
  });
});
