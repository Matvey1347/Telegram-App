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
    telegramManagedPost: {
      findMany: jest.fn().mockResolvedValue(managedPosts),
    },
    telegramPost: { findMany: jest.fn().mockResolvedValue(telegramPosts) },
    workspaceMember: { findFirst: jest.fn() },
  };
  const presentation = {
    attachManagedPostIcons: jest
      .fn()
      .mockImplementation((posts: unknown[]) => Promise.resolve(posts)),
  };
  const service = new TelegramManagedPostQueryService(
    prisma as never,
    {} as never,
    {
      workspace: jest.fn().mockResolvedValue('workspace-1'),
      invalidateTelegramChannelReadCache: jest.fn(),
    } as never,
    {
      isMissingTelegramManagedPostOriginColumns: jest
        .fn()
        .mockReturnValue(false),
    } as never,
    {} as never,
    {} as never,
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
    { normalizeChannelPostGroupNumberingOnRead: jest.fn() } as never,
    {
      reconcileDueManagedPosts: jest.fn().mockResolvedValue({ checked: 0 }),
    } as never,
    { autoRepairImportedManagedPostsOnRead: jest.fn() } as never,
  );
  return { service, prisma };
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

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
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
    });
    expect(telegramPostRead?.select).not.toHaveProperty('rawMessage');
  });

  it('appends unmatched synchronized posts as safely distinguishable read-only records', async () => {
    const { service } = setup([]);
    const result = await service.managedPosts('user-1', 'channel-1');

    expect(result[0]).toEqual(
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
    const { service, prisma } = setup([]);
    prisma.telegramPost.findMany.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(service.managedPosts('user-1', 'channel-1')).rejects.toThrow(
      'database unavailable',
    );
    expect(prisma.telegramPost.findMany).toHaveBeenCalledTimes(1);
  });
});
