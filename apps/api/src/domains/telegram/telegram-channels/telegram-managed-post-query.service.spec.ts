import { TelegramManagedPostStatus } from '@prisma/client';
import { TelegramManagedPostQueryService } from './telegram-managed-post-query.service';

const telegramPost = {
  id: 'synced-1',
  telegramMessageId: '42',
  text: 'Synced text',
  formattedText: '<b>Synced text</b>',
  hasMedia: false,
  mediaKind: null,
  postDate: new Date('2026-08-20T10:00:00.000Z'),
  viewsCount: 1_000,
  forwardsCount: 20,
  reactionsCount: 100,
  commentsCount: 10,
  manualOwnViews: 0,
  manualOwnReactions: 0,
  reactions: { '👍': 100 },
  createdAt: new Date('2026-08-20T10:00:00.000Z'),
  updatedAt: new Date('2026-08-20T11:00:00.000Z'),
};

function setup(
  managedPosts: Record<string, unknown>[],
  telegramPosts = [telegramPost],
) {
  const prisma = {
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    telegramManagedPost: {
      findMany: jest
        .fn()
        .mockImplementation((args?: { skip?: number; take?: number }) => {
          const skip = args?.skip ?? 0;
          return Promise.resolve(
            managedPosts.slice(
              skip,
              skip + (args?.take ?? managedPosts.length),
            ),
          );
        }),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(managedPosts.length),
    },
    telegramPost: { findMany: jest.fn().mockResolvedValue(telegramPosts) },
    workspaceMember: { findFirst: jest.fn() },
  };
  const presentation = {
    attachManagedPostIcons: jest
      .fn()
      .mockImplementation((posts: unknown[]) => Promise.resolve(posts)),
  };
  const syntheticRead = {
    count: jest
      .fn()
      .mockResolvedValue(managedPosts.length ? 0 : telegramPosts.length),
    findPage: jest
      .fn()
      .mockResolvedValue(managedPosts.length ? [] : telegramPosts),
    findOne: jest.fn(),
  };
  const service = new TelegramManagedPostQueryService(
    prisma as never,
    {
      workspace: jest.fn().mockResolvedValue('workspace-1'),
    } as never,
    {
      findOne: jest.fn().mockResolvedValue({
        id: 'channel-1',
        username: 'example_channel',
        telegramChatId: '123',
        currentSubscribersCount: 2_000,
        ownViewsPerPost: 0,
        ownReactionsPerPost: 0,
        assignedMember: {
          id: 'member-1',
          role: 'admin',
          telegramUsername: null,
          avatarIconId: null,
          avatarIcon: null,
          user: { id: 'user-1', name: 'Owner' },
        },
      }),
    } as never,
    presentation as never,
    syntheticRead as never,
  );
  return { service, prisma, syntheticRead };
}

describe('TelegramManagedPostQueryService unified read model', () => {
  it('enriches a managed post matched through its Telegram URL without duplicating it', async () => {
    const { service, prisma } = setup([
      {
        id: 'managed-1',
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        telegramMessageIds: [],
        telegramMessageUrls: ['https://t.me/example_channel/42'],
        assignedMember: null,
        group: null,
      },
    ]);

    const result = await service.managedPosts('user-1', 'channel-1');

    expect(result.pagination.totalItems).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'managed-1',
        readOnlyTelegramPost: false,
        primaryTelegramMessageUrl: 'https://t.me/example_channel/42',
        engagementMetrics: [
          expect.objectContaining({ telegramPostId: 'synced-1', err: 50 }),
        ],
      }),
    );
    const telegramPostCalls = prisma.telegramPost.findMany.mock
      .calls as unknown as Array<
      [{ where: unknown; select: Record<string, boolean> }]
    >;
    const telegramPostRead = telegramPostCalls[0]?.[0];
    expect(telegramPostRead?.where).toEqual({
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      telegramMessageId: { in: ['42'] },
    });
    expect(telegramPostRead?.select).not.toHaveProperty('rawMessage');
  });

  it('appends unmatched synchronized posts as safely distinguishable read-only records', async () => {
    const { service } = setup([]);
    const result = await service.managedPosts('user-1', 'channel-1');

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'telegram-post:synced-1',
        telegramPostId: 'synced-1',
        readOnlyTelegramPost: true,
        status: 'PUBLISHED',
        text: 'Synced text',
        formattedText: '<b>Synced text</b>',
        primaryTelegramMessageUrl: 'https://t.me/example_channel/42',
        telegramMessageIds: ['42'],
        engagementMetrics: [
          expect.objectContaining({ viewsCount: 1_000, reactionRate: 10 }),
        ],
      }),
    );
  });

  it('propagates TelegramPost read failures and never retries them as schema repair', async () => {
    const { service, prisma } = setup([
      {
        id: 'managed-1',
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        telegramMessageIds: ['42'],
        telegramMessageUrls: [],
        assignedMember: null,
        group: null,
      },
    ]);
    prisma.telegramPost.findMany.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(service.managedPosts('user-1', 'channel-1')).rejects.toThrow(
      'database unavailable',
    );
    expect(prisma.telegramPost.findMany).toHaveBeenCalledTimes(1);
  });

  it('bounds collection reads and pushes status filters into Prisma', async () => {
    const managedPosts = Array.from({ length: 100 }, (_, index) => ({
      id: `managed-${index}`,
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      telegramMessageIds: [],
      telegramMessageUrls: [],
      assignedMember: null,
      group: null,
    }));
    const { service, prisma } = setup(managedPosts, []);

    const result = await service.managedPosts('user-1', 'channel-1', {
      page: 2,
      pageSize: 25,
      status: [TelegramManagedPostStatus.DRAFT],
    });

    expect(result.items).toHaveLength(25);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
        where: expect.objectContaining({ status: { in: ['DRAFT'] } }),
      }),
    );
  });

  it('keeps collection GET pure and performs no source work for non-published filters', async () => {
    const { service, prisma, syntheticRead } = setup([], []);

    await service.managedPosts('user-1', 'channel-1', {
      status: [TelegramManagedPostStatus.DRAFT],
    });

    expect(syntheticRead.count).not.toHaveBeenCalled();
    expect(syntheticRead.findPage).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('scopes direct detail reads to the workspace and channel', async () => {
    const { service, prisma } = setup([], []);

    await expect(
      service.managedPost('user-1', 'channel-1', 'post-other-workspace'),
    ).rejects.toThrow('Managed post not found');

    expect(prisma.telegramManagedPost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'post-other-workspace',
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
        },
      }),
    );
  });
});
