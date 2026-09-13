import { AdHypothesesService } from './ad-hypotheses.service';
import { AdSystemHypothesesService } from './ad-system-hypotheses.service';

describe('AdHypothesesService', () => {
  const resolveWorkspaceIdForUser = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();
  const transaction = jest.fn();
  const channelFindMany = jest.fn();
  const channelFindFirst = jest.fn();
  const networkFindMany = jest.fn();
  const networkFindFirst = jest.fn();
  const campaignFindMany = jest.fn();
  const snapshotFindMany = jest.fn();

  const prisma = {
    adHypothesis: {
      findMany,
      count,
    },
    telegramChannel: { findMany: channelFindMany, findFirst: channelFindFirst },
    telegramChannelNetwork: {
      findMany: networkFindMany,
      findFirst: networkFindFirst,
    },
    adCampaign: { findMany: campaignFindMany },
    telegramInviteLinkSnapshot: { findMany: snapshotFindMany },
    $transaction: transaction,
  };

  const workspaceService = {
    resolveWorkspaceIdForUser,
  };

  let service: AdHypothesesService;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceIdForUser.mockResolvedValue('ws-1');
    channelFindMany.mockResolvedValue([]);
    channelFindFirst.mockResolvedValue(null);
    networkFindMany.mockResolvedValue([]);
    networkFindFirst.mockResolvedValue(null);
    campaignFindMany.mockResolvedValue([]);
    snapshotFindMany.mockResolvedValue([]);
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
      new AdSystemHypothesesService(prisma as never),
    );
  });

  it('lists hypotheses without wrapping read queries in a Prisma transaction', async () => {
    await expect(
      service.list('user-1', { page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'system:all-channels',
          isSystem: true,
          campaignsCount: 0,
        }),
        expect.objectContaining({
          id: 'hyp-1',
          name: 'Hypothesis 1',
          campaignsCount: 0,
        }),
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
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
    expect(listOperation.where).toEqual({
      workspaceId: 'ws-1',
      telegramChannel: {
        is: { archivedAt: null, adminLinks: { some: {} } },
      },
    });
    expect(listOperation.skip).toBe(0);
    expect(listOperation.take).toBe(19);
    expect(listOperation.select).not.toHaveProperty('createdByUser');
    expect(JSON.stringify(listOperation.select)).toContain('"adCampaign"');
    expect(JSON.stringify(listOperation.select)).not.toContain(
      '"admissionAnalytics"',
    );
    expect(count).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        telegramChannel: {
          is: { archivedAt: null, adminLinks: { some: {} } },
        },
      },
    });
  });

  it('builds system hypotheses for active channels and their networks', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    const channel = {
      id: 'channel-1',
      title: 'Channel 1',
      username: 'channel_one',
      photoUrl: null,
      targetCpaFrom: null,
      targetCpa: null,
      acceptableCpaFrom: null,
      acceptableCpa: null,
      stopCpaFrom: null,
      stopCpa: null,
      assignedMemberId: null,
      assignedMember: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    };
    channelFindMany.mockResolvedValue([channel]);
    networkFindMany.mockResolvedValue([
      {
        id: 'network-1',
        name: 'Network 1',
        iconId: null,
        icon: null,
        assignedMemberId: null,
        assignedMember: null,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
        channels: [{ telegramChannelId: channel.id }],
      },
    ]);
    campaignFindMany.mockResolvedValue([]);

    const result = await service.list('user-1', { page: 1, pageSize: 20 });

    const rows = result.items as Array<{
      id: string;
      telegramChannelId?: string;
      systemScope?: { kind: string };
    }>;
    expect(rows.some((row) => row.id === 'system:all-channels')).toBe(true);
    expect(
      rows.some(
        (row) =>
          row.id === 'system:channel:channel-1' &&
          row.telegramChannelId === 'channel-1',
      ),
    ).toBe(true);

    expect(channelFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          archivedAt: null,
          adminLinks: { some: {} },
        },
      }),
    );
    expect(networkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          channels: expect.objectContaining({
            where: {
              telegramChannel: {
                archivedAt: null,
                adminLinks: { some: {} },
              },
            },
          }),
        }),
      }),
    );
    expect(campaignFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          telegramChannel: {
            archivedAt: null,
            adminLinks: { some: {} },
          },
        },
      }),
    );
    expect(
      rows.some(
        (row) =>
          row.id === 'system:network:network-1' &&
          row.systemScope?.kind === 'network',
      ),
    ).toBe(true);
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

  it('returns a real trend for an active-channel system hypothesis', async () => {
    channelFindFirst.mockResolvedValue({ id: 'channel-1', title: 'Channel 1' });
    campaignFindMany.mockResolvedValue([
      {
        id: 'campaign-1',
        telegramChannelId: 'channel-1',
        inviteLinks: [
          {
            id: 'link-1',
            name: 'Main link',
            url: 'https://t.me/+main',
            joinedCount: 8,
            requestedCount: 0,
            isRevoked: false,
          },
        ],
      },
    ]);
    snapshotFindMany.mockResolvedValue([
      {
        adCampaignId: 'campaign-1',
        inviteLinkId: 'link-1',
        syncedAt: new Date('2026-09-13T10:00:00.000Z'),
        joinedCount: 10,
        requestedCount: 0,
        isRevoked: false,
      },
      {
        adCampaignId: 'campaign-1',
        inviteLinkId: 'link-1',
        syncedAt: new Date('2026-09-13T11:00:00.000Z'),
        joinedCount: 8,
        requestedCount: 0,
        isRevoked: false,
      },
    ]);

    const result = (await service.inviteLinkHistory(
      'user-1',
      'system:channel:channel-1',
    )) as {
      hypothesis: { id: string; name: string };
      summary: {
        currentTotalAttributed: number;
        peakTotalAttributed: number;
        drawdownFromPeak: number;
        campaignsCount: number;
      };
    };
    expect(result.hypothesis).toEqual({
      id: 'system:channel:channel-1',
      name: 'Channel 1',
    });
    expect(result.summary).toMatchObject({
      currentTotalAttributed: 8,
      peakTotalAttributed: 10,
      drawdownFromPeak: 2,
      campaignsCount: 1,
    });
    type CampaignQuery = {
      where: { workspaceId: string; telegramChannelId: { in: string[] } };
    };
    const campaignCalls = campaignFindMany.mock.calls as unknown as Array<
      [CampaignQuery]
    >;
    expect(campaignCalls.at(-1)?.[0].where).toMatchObject({
      workspaceId: 'ws-1',
      telegramChannel: {
        archivedAt: null,
        adminLinks: { some: {} },
      },
      telegramChannelId: { in: ['channel-1'] },
    });
    expect(channelFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'channel-1',
          workspaceId: 'ws-1',
          archivedAt: null,
          adminLinks: { some: {} },
        },
      }),
    );
  });

  it('rejects unknown system hypothesis ids without querying campaigns', async () => {
    await expect(
      service.inviteLinkHistory('user-1', 'system:unknown'),
    ).rejects.toThrow('System hypothesis not found');
    expect(campaignFindMany).not.toHaveBeenCalled();
  });
});
