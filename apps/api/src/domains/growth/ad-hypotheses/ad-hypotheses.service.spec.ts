import { AdHypothesesService } from './ad-hypotheses.service';

describe('AdHypothesesService', () => {
  const resolveWorkspaceIdForUser = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();
  const transaction = jest.fn();

  const prisma = {
    adHypothesis: {
      findMany,
      count,
    },
    $transaction: transaction,
  };

  const workspaceService = {
    resolveWorkspaceIdForUser,
  };

  let service: AdHypothesesService;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceIdForUser.mockResolvedValue('ws-1');
    findMany.mockResolvedValue([
      {
        id: 'hyp-1',
        name: 'Hypothesis 1',
        description: null,
        status: 'testing',
        conclusion: null,
        iconId: null,
        icon: null,
        telegramChannelId: 'channel-1',
        telegramChannel: { id: 'channel-1', title: 'Channel 1' },
        createdAt: new Date('2026-07-29T08:00:00.000Z'),
        updatedAt: new Date('2026-07-29T08:00:00.000Z'),
        assignedMemberId: 'member-1',
        assignedMember: null,
        createdByUserId: 'user-1',
        createdByUser: null,
        campaigns: [],
      },
    ]);
    count.mockResolvedValue(1);
    transaction.mockRejectedValue(new Error('should not use transaction'));
    service = new AdHypothesesService(
      prisma as never,
      workspaceService as never,
    );
  });

  it('lists hypotheses without wrapping read queries in a Prisma transaction', async () => {
    await expect(
      service.list('user-1', { page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'hyp-1',
          name: 'Hypothesis 1',
          campaignsCount: 0,
        }),
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    expect(transaction).not.toHaveBeenCalled();
    type ListOperation = {
      where: unknown;
      select: Record<string, unknown>;
      skip: number;
      take: number;
    };
    const listOperation = (
      findMany.mock.calls as unknown as Array<[ListOperation]>
    )[0][0];
    expect(listOperation.where).toEqual({ workspaceId: 'ws-1' });
    expect(listOperation.skip).toBe(0);
    expect(listOperation.take).toBe(20);
    expect(listOperation.select).not.toHaveProperty('createdByUser');
    expect(JSON.stringify(listOperation.select)).toContain('"adCampaign"');
    expect(JSON.stringify(listOperation.select)).not.toContain(
      '"admissionAnalytics"',
    );
    expect(count).toHaveBeenCalledWith({ where: { workspaceId: 'ws-1' } });
  });

  it('uses one workspace-scoped search predicate for hypothesis data and count', async () => {
    let findWhere: unknown;
    let countWhere: unknown;
    findMany.mockImplementation((query: { where: unknown }) => {
      findWhere = query.where;
      return Promise.resolve([]);
    });
    count.mockImplementation((query: { where: unknown }) => {
      countWhere = query.where;
      return Promise.resolve(0);
    });
    await service.list('user-1', { search: 'scale' });

    expect(findWhere).toBe(countWhere);
    expect(JSON.stringify(findWhere)).toContain('"workspaceId":"ws-1"');
    expect(JSON.stringify(findWhere)).toContain('"conclusion"');
    expect(JSON.stringify(findWhere)).toContain('"telegramChannel"');
    expect(JSON.stringify(findWhere)).toContain('"campaigns"');
  });
});
