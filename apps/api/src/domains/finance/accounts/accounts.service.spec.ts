import { AccountsService } from './accounts.service';

describe('AccountsService', () => {
  const prisma = {
    account: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    workspace: { findUniqueOrThrow: jest.fn() },
    transaction: { groupBy: jest.fn() },
    transfer: { groupBy: jest.fn() },
    transactionCategory: { findUniqueOrThrow: jest.fn() },
    $transaction: jest.fn(),
  };
  const workspaceService = { resolveWorkspaceIdForUser: jest.fn() };
  const conversion = { convertCurrency: jest.fn(), getRate: jest.fn() };
  const categories = { ensureSystemCategories: jest.fn() };
  const authorization = { require: jest.fn(), can: jest.fn(), requireOwnOrAny: jest.fn() };
  let service: AccountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AccountsService(
      prisma as never,
      workspaceService as never,
      conversion as never,
      categories as never,
      authorization as never,
    );
    authorization.require.mockResolvedValue({
      workspaceId: 'workspace-1',
      memberId: 'member-1',
    });
    authorization.can.mockResolvedValue(false);
    prisma.account.findMany.mockResolvedValue([]);
    prisma.account.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    prisma.workspace.findUniqueOrThrow.mockResolvedValue({
      primaryCurrency: 'UAH',
      secondaryCurrency: 'USD',
    });
    prisma.transaction.groupBy.mockResolvedValue([]);
    prisma.transfer.groupBy.mockResolvedValue([]);
    conversion.getRate.mockResolvedValue(40);
    categories.ensureSystemCategories.mockResolvedValue(undefined);
  });

  it('loads only the current member’s active accounts for the My accounts tab', async () => {
    await service.findAll('user-1', { scope: 'mine' });

    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          assignedMemberId: 'member-1',
          isActive: true,
          deletedAt: null,
        }),
      }),
    );
  });

  it('loads archived accounts without treating them as deleted', async () => {
    await service.findAll('user-1', { scope: 'archived' });

    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: false, deletedAt: null }),
      }),
    );
  });

  it('archives instead of deleting an account so its financial history remains', async () => {
    workspaceService.resolveWorkspaceIdForUser.mockResolvedValue('workspace-1');
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      workspaceId: 'workspace-1',
    });
    prisma.account.update.mockResolvedValue({ id: 'account-1', isActive: false });

    await service.remove('user-1', 'account-1');

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { isActive: false, deletedAt: null },
    });
  });

  it('adds an auditable opening investment when an existing account is funded', async () => {
    workspaceService.resolveWorkspaceIdForUser.mockResolvedValue('workspace-1');
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      workspaceId: 'workspace-1',
      currency: 'USD',
      assignedMemberId: 'member-1',
    });
    authorization.requireOwnOrAny.mockResolvedValue(undefined);
    prisma.transactionCategory.findUniqueOrThrow.mockResolvedValue({
      id: 'investment-category',
      name: 'Investment',
    });
    const tx = {
      account: { update: jest.fn().mockResolvedValue({ id: 'account-1' }) },
      transaction: {
        create: jest.fn().mockResolvedValue({
          id: 'transaction-1',
          date: new Date('2026-10-07T00:00:00.000Z'),
        }),
      },
      investment: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );

    await service.update('user-1', 'account-1', { initialBalance: 250 });

    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'account-1',
          amount: 250,
          currency: 'USD',
          memberId: 'member-1',
          description: 'Opening investment',
        }),
      }),
    );
    expect(tx.investment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ transactionId: 'transaction-1' }),
      }),
    );
  });
});
