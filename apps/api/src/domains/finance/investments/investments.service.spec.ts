import { InvestmentsService } from './investments.service';

describe('InvestmentsService', () => {
  const setup = () => {
    const tx = {
      transaction: { create: jest.fn() },
      investment: { create: jest.fn() },
    };
    const prisma = {
      workspace: { findFirst: jest.fn() },
      workspaceMember: { findFirst: jest.fn() },
      account: { findFirst: jest.fn() },
      transactionCategory: { findUnique: jest.fn() },
      investment: { findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const workspaceService = {
      resolveAssignedMemberId: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        assignedMemberId: 'owner-member',
      }),
    };
    const authorization = { require: jest.fn().mockResolvedValue({}), can: jest.fn() };
    const financeCategories = { ensureSystemCategories: jest.fn() };
    const service = new InvestmentsService(
      prisma as never,
      workspaceService as never,
      authorization as never,
      financeCategories as never,
    );
    return { service, prisma, tx, financeCategories, authorization };
  };

  it('lists native amounts within the authorised workspace and the caller’s own scope', async () => {
    const { service, prisma, authorization } = setup();
    authorization.require.mockResolvedValue({ workspaceId: 'active-workspace', memberId: 'current-member' });
    authorization.can.mockImplementation(async (_user, permission) => permission === 'finance.editOwn');
    const date = new Date('2026-10-03T14:00:00Z');
    prisma.investment.findMany.mockResolvedValue([
      { id: 'withdrawal', amount: 18, date, currency: 'PLN', notes: null, movementType: 'WITHDRAWAL', workspaceMember: { user: { name: 'Investor' } }, account: null },
    ]);
    prisma.investment.count.mockResolvedValue(11);
    prisma.$transaction.mockImplementation((operations) => Promise.all(operations));

    const list = await service.findAll('reader', { page: 2, pageSize: 10 });
    expect(list.items).toEqual([
      { id: 'withdrawal', amount: '18', date: date.toISOString(), currency: 'PLN', notes: null, movementType: 'WITHDRAWAL', workspaceMember: { user: { name: 'Investor' } }, account: null },
    ]);
    expect(list.pagination.totalItems).toBe(11);
    expect(prisma.investment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'active-workspace', assignedMemberId: 'current-member' },
      skip: 10,
      take: 10,
      select: expect.objectContaining({ workspaceMember: { select: { user: { select: { name: true } } } } }),
    }));
  });

  it('requires Finance read permission before fetching investments', async () => {
    const { service, prisma, authorization } = setup();
    authorization.require.mockRejectedValue(new Error('denied'));
    await expect(service.findAll('blocked')).rejects.toThrow('denied');
    expect(prisma.investment.findMany).not.toHaveBeenCalled();
  });

  it('links the generated transaction to its category and actual investor', async () => {
    const { service, prisma, tx, financeCategories } = setup();
    prisma.workspace.findFirst.mockResolvedValue({
      id: 'workspace-1',
      primaryCurrency: 'USD',
    });
    prisma.workspaceMember.findFirst.mockResolvedValue({
      id: 'investor-member',
      user: { name: 'Investor' },
    });
    prisma.account.findFirst.mockResolvedValue({
      id: 'account-1',
      currency: 'USD',
    });
    prisma.transactionCategory.findUnique.mockResolvedValue({
      id: 'investment-category',
    });
    tx.transaction.create.mockResolvedValue({ id: 'transaction-1' });
    tx.investment.create.mockResolvedValue({ id: 'investment-1' });

    await service.create('creator-user', {
      workspaceMemberId: 'investor-member',
      accountId: 'account-1',
      amount: 500,
      date: '2026-09-13',
    });

    expect(financeCategories.ensureSystemCategories).toHaveBeenCalledWith(
      'workspace-1',
    );
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdByUserId: 'creator-user',
          assignedMemberId: 'owner-member',
          memberId: 'investor-member',
          categoryId: 'investment-category',
        }),
      }),
    );
  });
});
