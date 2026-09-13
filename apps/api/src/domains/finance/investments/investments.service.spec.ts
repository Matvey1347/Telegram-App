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
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const workspaceService = {
      resolveAssignedMemberId: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        assignedMemberId: 'owner-member',
      }),
    };
    const authorization = { require: jest.fn().mockResolvedValue({}) };
    const financeCategories = { ensureSystemCategories: jest.fn() };
    const service = new InvestmentsService(
      prisma as never,
      workspaceService as never,
      authorization as never,
      financeCategories as never,
    );
    return { service, prisma, tx, financeCategories };
  };

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
