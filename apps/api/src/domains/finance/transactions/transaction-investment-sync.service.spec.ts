import { Prisma } from '@prisma/client';
import { TransactionInvestmentSyncService } from './transaction-investment-sync.service';
import { TransactionsService } from './transactions.service';

type UpsertInput = {
  where: { transactionId: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

describe('TransactionInvestmentSyncService', () => {
  const service = new TransactionInvestmentSyncService();

  it('creates or refreshes the dashboard investment for an investment transaction', async () => {
    const upsert = jest.fn((input: UpsertInput) => {
      void input;
      return Promise.resolve({});
    });
    const tx = { investment: { upsert } };

    await service.syncContribution(tx as never, {
      id: 'transaction-1',
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      memberId: 'investor-1',
      amount: new Prisma.Decimal(2500),
      currency: 'PLN',
      amountInPrimaryCurrency: new Prisma.Decimal(25000),
      exchangeRateToPrimary: new Prisma.Decimal(10),
      date: new Date('2026-09-12T00:00:00.000Z'),
      description: 'Investment',
      createdByUserId: 'owner-1',
      assignedMemberId: 'assignee-1',
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const input = upsert.mock.calls[0][0];
    expect(input.where).toEqual({ transactionId: 'transaction-1' });
    expect(input.create).toMatchObject({
      transactionId: 'transaction-1',
      workspaceMemberId: 'investor-1',
      amountInPrimaryCurrency: new Prisma.Decimal(25000),
      origin: 'EXTERNAL',
      movementType: 'CONTRIBUTION',
    });
    expect(input.update).toMatchObject({
      workspaceMemberId: 'investor-1',
      amountInPrimaryCurrency: new Prisma.Decimal(25000),
    });
  });

  it('removes only the external investment linked to a deleted transaction', async () => {
    const tx = { investment: { deleteMany: jest.fn() } };

    await service.removeContribution(tx as never, 'transaction-1');

    expect(tx.investment.deleteMany).toHaveBeenCalledWith({
      where: { transactionId: 'transaction-1', origin: 'EXTERNAL' },
    });
  });

  it('does not create an investment without an investor', async () => {
    const tx = { investment: { upsert: jest.fn() } };

    await service.syncContribution(tx as never, {
      id: 'transaction-1',
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      memberId: null,
      amount: new Prisma.Decimal(1),
      currency: 'USD',
      amountInPrimaryCurrency: new Prisma.Decimal(1),
      exchangeRateToPrimary: new Prisma.Decimal(1),
      date: new Date(),
      description: null,
      createdByUserId: null,
      assignedMemberId: null,
    });

    expect(tx.investment.upsert).not.toHaveBeenCalled();
  });
});

describe('TransactionsService investment synchronization', () => {
  it('synchronizes a generic investment transaction before returning it', async () => {
    const transaction = {
      id: 'transaction-1',
      workspaceId: 'workspace-1',
      accountId: 'account-1',
      memberId: 'investor-1',
      amount: 2500,
      currency: 'PLN',
      amountInPrimaryCurrency: 25000,
      exchangeRateToPrimary: 10,
      date: new Date('2026-09-12T00:00:00.000Z'),
      description: 'Investment',
      createdByUserId: 'owner-1',
      assignedMemberId: null,
    };
    const transactionClient = {
      transaction: { create: jest.fn().mockResolvedValue(transaction) },
    };
    const prisma = {
      ...transactionClient,
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ primaryCurrency: 'UAH' }),
      },
      account: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'account-1',
          currency: 'PLN',
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(
        (callback: (client: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    };
    const investmentSync = { syncContribution: jest.fn() };
    const service = new TransactionsService(
      prisma as never,
      {
        resolveAssignedMemberId: jest.fn().mockResolvedValue({
          workspaceId: 'workspace-1',
          assignedMemberId: null,
        }),
      } as never,
      { getRate: jest.fn().mockResolvedValue(10) } as never,
      { ensureSystemCategories: jest.fn() } as never,
      { require: jest.fn() } as never,
      {
        validate: jest.fn().mockResolvedValue({
          id: 'category-1',
          key: 'investment',
          name: 'Investment',
          type: 'income',
        }),
      } as never,
      investmentSync as never,
    );

    await service.create('owner-1', {
      accountId: 'account-1',
      type: 'income',
      amount: 2500,
      categoryId: 'category-1',
      memberId: 'investor-1',
      date: '2026-09-12',
    });

    expect(investmentSync.syncContribution).toHaveBeenCalledWith(
      transactionClient,
      transaction,
    );
  });
});
