import { findWorkspaceMemberInvestmentTransactions } from './workspace-member-investments-read';

describe('findWorkspaceMemberInvestmentTransactions', () => {
  it('returns the same icon presentations consumed by Finance transaction rows', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'transaction-1',
        icon: null,
        account: {
          id: 'account-1',
          icon: { id: 'account-icon', type: 'emoji', emoji: '💳' },
        },
        categoryRef: {
          id: 'investment',
          icon: { id: 'category-icon', type: 'emoji', emoji: '📈' },
        },
        member: null,
        investment: { id: 'investment-1' },
      },
    ]);

    const rows = await findWorkspaceMemberInvestmentTransactions(
      { transaction: { findMany } } as never,
      'workspace-1',
      'member-1',
    );

    expect(rows[0]).toEqual(
      expect.objectContaining({
        account: expect.objectContaining({
          iconPresentation: expect.objectContaining({ value: '💳' }),
        }),
        categoryRef: expect.objectContaining({
          iconPresentation: expect.objectContaining({ value: '📈' }),
        }),
      }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          memberId: 'member-1',
          deletedAt: null,
        }),
      }),
    );
  });
});
