import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { TrashService } from './trash.service';

describe('TrashService.list', () => {
  it('loads only each type’s page-sized prefix and returns exact merged pagination', async () => {
    const deletedAt = new Date(Date.now() - 10 * 86_400_000);
    const delegates = [
      'account',
      'transaction',
      'transactionCategory',
      'transfer',
      'financeAccount',
      'financeTransaction',
      'financeCategory',
      'financeTransfer',
    ];
    const prisma = Object.fromEntries(
      delegates.map((delegate, index) => [
        delegate,
        {
          findMany: jest.fn().mockResolvedValue(
            index === 0
              ? [
                  { id: 'a1', name: 'Account 1', deletedAt },
                  { id: 'a2', name: 'Account 2', deletedAt },
                ]
              : [],
          ),
          count: jest.fn().mockResolvedValue(index + 1),
        },
      ]),
    ) as unknown as PrismaService;
    const workspace = {
      requireWorkspaceRole: jest.fn().mockResolvedValue({ workspaceId: 'w1' }),
    } as unknown as WorkspaceService;
    const service = new TrashService(prisma, workspace);

    const result = await service.list('u1', 2, 1);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Account 2');
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalItems: 36,
      totalPages: 36,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    for (const delegate of delegates) {
      const model = (
        prisma as unknown as Record<
          string,
          {
            findMany: jest.Mock;
          }
        >
      )[delegate];
      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
        }),
      );
    }
  });
});
