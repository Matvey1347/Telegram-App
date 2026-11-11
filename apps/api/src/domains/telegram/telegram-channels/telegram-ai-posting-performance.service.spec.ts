import { TelegramAiPostingPerformanceService } from './telegram-ai-posting-performance.service';

describe('TelegramAiPostingPerformanceService scheduled work', () => {
  it('does not call Telegram when no age point is due', async () => {
    const prisma = {
      telegramAiPostingSettings: {
        findMany: jest.fn().mockResolvedValue([
          {
            workspaceId: 'workspace-1',
            telegramChannelId: 'channel-1',
            telegramChannel: { workspace: { timezone: 'UTC' } },
          },
        ]),
      },
      telegramPost: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    const metrics = { syncPostsMetricsForWorkspace: jest.fn() };
    const service = new TelegramAiPostingPerformanceService(
      prisma as never,
      {} as never,
      metrics as never,
    );

    const result = await service.processScheduledBatch(
      new Date('2026-01-01T00:00:00Z'),
    );

    expect(metrics.syncPostsMetricsForWorkspace).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dueChannels: 0, syncedChannels: 0 });
  });
});
