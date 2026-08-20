import { TelegramChannelsService } from './telegram-channels.service';

describe('TelegramChannelsService syncPostsMetricsForWorkspace', () => {
  const prisma = {
    telegramChannel: {
      findFirst: jest.fn(),
    },
    telegramPost: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    telegramPostMetricSnapshot: { create: jest.fn() },
  };
  const sourceAccessService = {
    recordDataSource: jest.fn(),
  };
  const mtprotoClient = {
    getChannelPostsMetrics: jest.fn(),
  };

  let service: TelegramChannelsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramChannelsService(
      prisma as never,
      {} as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      mtprotoClient as never,
      sourceAccessService as never,
      {} as never,
    );
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      username: 'mentor_samorozvytok',
      telegramChatId: '123456',
    });
    mtprotoClient.getChannelPostsMetrics.mockResolvedValue([]);
    jest
      .spyOn(service as never, 'getChannelSyncCutoffs' as never)
      .mockResolvedValue({
        postsSyncFrom: new Date('2026-07-24T17:55:00.427Z'),
        inviteLinksSyncFrom: new Date('2026-07-24T17:55:00.427Z'),
      } as never);
    jest
      .spyOn(service as never, 'connectedAccount' as never)
      .mockResolvedValue({ id: 'account-1' } as never);
    jest
      .spyOn(service as never, 'accountCredentials' as never)
      .mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      } as never);
    jest
      .spyOn(service as never, 'persistPostMetrics' as never)
      .mockResolvedValue({ affectedDays: 0 } as never);
    jest
      .spyOn(service as never, 'createAudienceSnapshotSafely' as never)
      .mockResolvedValue(null as never);
  });

  it('loads the latest posts window without filtering by postsSyncFrom', async () => {
    await service.syncPostsMetricsForWorkspace('workspace-1', 'channel-1', {});

    expect(mtprotoClient.getChannelPostsMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
        postLimit: 50,
      }),
    );
    expect(
      mtprotoClient.getChannelPostsMetrics.mock.calls[0]?.[0]?.postsFrom,
    ).toBeUndefined();
  });

  it('keeps manual metrics sync available for a channel with auto sync disabled', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValueOnce({
      id: 'channel-1',
      username: 'mentor_samorozvytok',
      telegramChatId: '123456',
      autoSyncEnabled: false,
    });

    await service.syncPostsMetricsForWorkspace('workspace-1', 'channel-1', {});

    expect(mtprotoClient.getChannelPostsMetrics).toHaveBeenCalled();
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'channel-1', workspaceId: 'workspace-1', isActive: true } }),
    );
  });

  it('does not write duplicate posts, snapshots, or daily stats for unchanged metrics', async () => {
    jest.restoreAllMocks();
    const postDate = new Date('2026-08-12T10:00:00.000Z');
    const metric = {
      telegramMessageId: '101', postDate, text: 'same', formattedText: 'same',
      hasMedia: false, mediaKind: null, viewsCount: 10, forwardsCount: 1,
      reactionsCount: 2, commentsCount: 0, reactions: { '👍': 2 }, rawMessage: { id: 101 },
    };
    prisma.telegramPost.findMany.mockResolvedValueOnce([{ id: 'post-1', ...metric }]);
    const internals = service as unknown as {
      persistPostMetrics: (
        workspaceId: string,
        channelId: string,
        metrics: unknown[],
      ) => Promise<{ affectedDays: number; changedPosts: number; snapshotsCreated: number }>;
      recalculateDailyStatsFromPosts: jest.Mock;
    };
    internals.recalculateDailyStatsFromPosts = jest.fn();

    const result = await internals.persistPostMetrics('workspace-1', 'channel-1', [metric]);

    expect(result).toEqual({ affectedDays: 0, changedPosts: 0, snapshotsCreated: 0 });
    expect(prisma.telegramPost.update).not.toHaveBeenCalled();
    expect(prisma.telegramPost.create).not.toHaveBeenCalled();
    expect(prisma.telegramPostMetricSnapshot.create).not.toHaveBeenCalled();
    expect(internals.recalculateDailyStatsFromPosts).not.toHaveBeenCalled();
  });

  it('does not append data-source rows or an audience snapshot for an unchanged poll', async () => {
    await service.syncPostsMetricsForWorkspace('workspace-1', 'channel-1', {});

    expect(sourceAccessService.recordDataSource).not.toHaveBeenCalled();
    expect((service as any).createAudienceSnapshotSafely).toHaveBeenCalledTimes(0);
  });
});
