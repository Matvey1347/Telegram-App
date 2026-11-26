import { AdCampaignListReadService } from './ad-campaign-list-read.service';

describe('AdCampaignListReadService', () => {
  it('shares bot requests between overlapping campaigns including those outside the page', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const inviteLink = { id: 'link', telegramChannelId: 'channel', joinedCount: 0, requestedCount: 10, requestedObservedAt: new Date('2026-01-02T00:00:00Z'), telegramChannel: { title: 'Channel', photoUrl: null } };
    const row = { id: 'first', placementDate: start, startedAt: null, createdAt: start, endedAt: null, botInviteLinks: [{ baselineJoinedCount: 0, baselineRequestedCount: 0, inviteLink }] };
    const prisma = { adCampaignBotInviteLink: { findMany: jest.fn().mockResolvedValue(['first', 'second'].map((id) => ({ inviteLinkId: 'link', adCampaign: { id, placementDate: start, startedAt: null, createdAt: start, endedAt: null } }))) }, telegramInviteLinkSnapshot: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new AdCampaignListReadService(prisma as never, {} as never);
    const result = await (service as any).loadBotRequestMetrics('workspace', [row]);
    expect(result.get('first')).toMatchObject({ total: 5, estimated: true });
    expect(prisma.adCampaignBotInviteLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ adCampaign: { workspaceId: 'workspace' } }) }));
  });

  it('uses measured views of a competing promotion on the destination of a shared bot link', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-02T00:00:00Z');
    const inviteLink = { id: 'link', telegramChannelId: 'channel', telegramChannel: { title: 'Channel', photoUrl: null } };
    const row = { id: 'ad', telegramChannelId: 'primary-channel', placementDate: start, createdAt: start, endedAt: end, sourcePostViews: 100, botInviteLinks: [{ kind: 'BOT', inviteLink }] };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ campaignId: 'vp', channelId: 'primary-channel', startsAt: start, endsAt: end, views: 300 }]),
      adCampaignBotInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLinkSnapshot: { findMany: jest.fn().mockResolvedValue([{ inviteLinkId: 'link', syncedAt: end, joinedCount: 0, requestedCount: 80 }]) },
    };
    const service = new AdCampaignListReadService(prisma as never, {} as never);
    const result = await (service as any).loadBotRequestMetrics('workspace', [row]);
    expect(result.get('ad')).toMatchObject({ total: 20, estimated: true });
  });

  it('uses a compact, workspace-scoped list read with bounded operations', async () => {
    type ListQuery = {
      where: { workspaceId: string };
      select: Record<string, unknown> & {
        inviteLinks: Record<string, unknown>;
      };
    };
    let query: ListQuery | undefined;
    const findMany = jest.fn((value: ListQuery) => {
      query = value;
      return Promise.resolve([]);
    });
    const prisma = {
      adCampaign: {
        findMany,
        count: jest.fn().mockResolvedValue(0),
      },
      telegramChannel: { findMany: jest.fn() },
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    const service = new AdCampaignListReadService(
      prisma as never,
      workspaceService as never,
    );

    await expect(service.findAll('user-1')).resolves.toMatchObject({
      items: [],
      pagination: { totalItems: 0 },
    });

    if (!query) throw new Error('Expected campaign list query');
    expect(query.where).toEqual(
      expect.objectContaining({ workspaceId: 'workspace-1' }),
    );
    expect(query.select).not.toHaveProperty('account');
    expect(query.select).not.toHaveProperty('admissionAnalytics');
    expect(query.select.inviteLinks).toHaveProperty('select');
    expect(query.select.inviteLinks).not.toHaveProperty('include');
    expect(workspaceService.resolveWorkspaceIdForUser).toHaveBeenCalledTimes(1);
    expect(prisma.adCampaign.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.adCampaign.count).toHaveBeenCalledTimes(1);
    expect(prisma.telegramChannel.findMany).not.toHaveBeenCalled();
  });

  it('uses three bounded campaign reads for globally filtered and sorted pages', async () => {
    const whereByOperation: unknown[] = [];
    let listOperation:
      | { where: unknown; select: Record<string, unknown> }
      | undefined;
    const prisma = {
      adCampaign: {
        findMany: jest.fn(
          (query: { where: unknown; select: Record<string, unknown> }) => {
            listOperation = query;
            return Promise.resolve([]);
          },
        ),
        count: jest.fn((query: { where: unknown }) => {
          whereByOperation.push(query.where);
          return Promise.resolve(120);
        }),
      },
      telegramChannel: { findMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'campaign-51' }]),
    };
    const service = new AdCampaignListReadService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
      } as never,
    );

    const result = await service.findAll('user-1', {
      page: 2,
      pageSize: 50,
      search: 'source title',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      sort: 'date_desc',
    });

    expect(result.pagination).toEqual(
      expect.objectContaining({ page: 2, totalItems: 120 }),
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.adCampaign.count).toHaveBeenCalledTimes(1);
    expect(prisma.adCampaign.findMany).toHaveBeenCalledTimes(1);
    expect(listOperation?.where).toEqual({
      workspaceId: 'workspace-1',
      id: { in: ['campaign-51'] },
    });
    expect(listOperation?.select).toBeDefined();
    expect(whereByOperation[0]).toEqual(
      expect.objectContaining({ workspaceId: 'workspace-1' }),
    );
    expect(prisma.telegramChannel.findMany).not.toHaveBeenCalled();
  });
});
