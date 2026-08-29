import { AdCampaignListReadService } from './ad-campaign-list-read.service';

describe('AdCampaignListReadService', () => {
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
