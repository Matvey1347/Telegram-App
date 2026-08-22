import { TelegramWorkspaceSyncTasksService } from './telegram-workspace-sync-tasks.service';

describe('TelegramWorkspaceSyncTasksService automatic selections', () => {
  const prisma = {
    telegramChannel: { findMany: jest.fn() },
    telegramChannelAdminLink: { findFirst: jest.fn() },
  };
  const channels = {
    syncPostsMetricsForWorkspace: jest.fn(),
    syncBroadcastStatsForWorkspace: jest.fn(),
  };
  const logger = { info: jest.fn() };
  let service: TelegramWorkspaceSyncTasksService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TelegramWorkspaceSyncTasksService(
      prisma as never,
      channels as never,
      channels as never,
      logger as never,
    );
    channels.syncPostsMetricsForWorkspace.mockResolvedValue({ syncedPosts: 0, changedPosts: 0, snapshotsCreated: 0, affectedDays: 0 });
    channels.syncBroadcastStatsForWorkspace.mockResolvedValue({});
    prisma.telegramChannelAdminLink.findFirst.mockResolvedValue({ telegramUserAccountIntegrationId: 'account-1' });
  });

  it('uses post-metrics and channel-stats flags independently', async () => {
    prisma.telegramChannel.findMany
      .mockResolvedValueOnce([
        { id: 'metrics', autoSyncEnabled: true, syncIncludePostMetrics: true },
        { id: 'stats', autoSyncEnabled: true, syncIncludePostMetrics: false },
      ])
      .mockResolvedValueOnce([{ id: 'stats', autoSyncEnabled: true, syncIncludeChannelStats: true }]);

    await service.syncPostMetricsForWorkspace('workspace-1');
    await service.syncBroadcastStatsForWorkspace('workspace-1');

    expect(channels.syncPostsMetricsForWorkspace).toHaveBeenCalledWith('workspace-1', 'metrics', { postLimit: 100 });
    expect(channels.syncBroadcastStatsForWorkspace).toHaveBeenCalledWith('workspace-1', 'stats', 'account-1');
  });

  it('does not invoke Telegram for auto-sync disabled channels', async () => {
    prisma.telegramChannel.findMany
      .mockResolvedValueOnce([{ id: 'off', autoSyncEnabled: false, syncIncludePostMetrics: true }])
      .mockResolvedValueOnce([]);

    await service.syncPostMetricsForWorkspace('workspace-1');
    await service.syncBroadcastStatsForWorkspace('workspace-1');

    expect(channels.syncPostsMetricsForWorkspace).not.toHaveBeenCalled();
    expect(channels.syncBroadcastStatsForWorkspace).not.toHaveBeenCalled();
  });

  it('reports measured auto-sync and selection skips for 100 channels', async () => {
    prisma.telegramChannel.findMany.mockResolvedValueOnce([
      ...Array.from({ length: 20 }, (_, index) => ({ id: `eligible-${index}`, autoSyncEnabled: true, syncIncludePostMetrics: true })),
      ...Array.from({ length: 80 }, (_, index) => ({ id: `off-${index}`, autoSyncEnabled: false, syncIncludePostMetrics: true })),
    ]);
    const result = await service.syncPostMetricsForWorkspace('workspace-1');
    expect(channels.syncPostsMetricsForWorkspace).toHaveBeenCalledTimes(20);
    expect(result.summary).toContain('auto-sync skipped 80');
  });
});
