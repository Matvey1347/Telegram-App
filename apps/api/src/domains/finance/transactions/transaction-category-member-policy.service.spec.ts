import { TransactionCategoryMemberPolicyService } from './transaction-category-member-policy.service';

describe('TransactionCategoryMemberPolicyService', () => {
  const setup = (member: unknown = { id: 'member-1' }) => {
    const prisma = {
      transactionCategory: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'salary-category',
          type: 'expense',
          key: 'salary',
          name: 'Salary',
        }),
      },
      workspaceMember: { findFirst: jest.fn().mockResolvedValue(member) },
    };
    return {
      prisma,
      service: new TransactionCategoryMemberPolicyService(prisma as never),
    };
  };

  it('accepts a Salary expense assigned to a member in the workspace', async () => {
    const { service, prisma } = setup();
    await expect(
      service.validate({
        workspaceId: 'workspace-1',
        type: 'expense',
        categoryId: 'salary-category',
        memberId: 'member-1',
      }),
    ).resolves.toMatchObject({ key: 'salary' });
    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { id: 'member-1', workspaceId: 'workspace-1' },
    });
  });

  it('rejects a Salary expense without a member', async () => {
    const { service } = setup();
    await expect(
      service.validate({
        workspaceId: 'workspace-1',
        type: 'expense',
        categoryId: 'salary-category',
      }),
    ).rejects.toThrow('memberId is required for Salary expense category');
  });

  it('rejects a member that does not belong to the workspace', async () => {
    const { service } = setup(null);
    await expect(
      service.validate({
        workspaceId: 'workspace-1',
        type: 'expense',
        categoryId: 'salary-category',
        memberId: 'foreign-member',
      }),
    ).rejects.toThrow('Member not found');
  });
});
