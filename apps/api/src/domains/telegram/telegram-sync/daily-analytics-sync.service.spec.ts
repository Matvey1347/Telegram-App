/* eslint-disable @typescript-eslint/no-unsafe-argument,
  @typescript-eslint/no-unsafe-assignment */
import { DailyAnalyticsSyncService } from './daily-analytics-sync.service';

function setup(channelCount: number) {
  const channels = Array.from({ length: channelCount }, (_, index) => ({
    id: `channel-${index}`,
    workspaceId: 'workspace-1',
    syncIncludePostMetrics: false,
    syncIncludeChannelStats: true,
    syncIncludeAudienceSnapshot: false,
    adminLinks: [{ telegramUserAccountIntegrationId: `integration-${index}` }],
  }));
  const completedRun = {
    id: 'run-1',
    status: 'success',
  };
  const prisma = {
    dailyAnalyticsSyncRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      update: jest.fn().mockResolvedValue(completedRun),
    },
    workspace: { findMany: jest.fn().mockResolvedValue([]) },
    telegramChannel: { findMany: jest.fn().mockResolvedValue(channels) },
    telegramChannelAdminLink: { findFirst: jest.fn() },
    adCampaign: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
  };
  const postMetrics = { syncPostsMetricsForWorkspace: jest.fn() };
  const broadcastStats = {
    syncBroadcastStatsForWorkspace: jest.fn().mockResolvedValue(undefined),
  };
  const channelAnalytics = { createAudienceSnapshot: jest.fn() };
  const campaignAnalytics = { recalculateCampaignAnalytics: jest.fn() };
  const applicationLogger = {
    info: jest.fn(),
    writeStructured: jest.fn(),
  };
  const service = new DailyAnalyticsSyncService(
    prisma as any,
    postMetrics as any,
    broadcastStats as any,
    channelAnalytics as any,
    campaignAnalytics as any,
    applicationLogger as any,
  );
  return { service, prisma, broadcastStats, completedRun };
}

describe('DailyAnalyticsSyncService performance', () => {
  it('hydrates first admin links in the one channel query at 100 channels', async () => {
    const { service, prisma, broadcastStats } = setup(100);

    await service.runDailyAnalyticsSync({
      workspaceId: 'workspace-1',
      source: 'manual',
    });

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'workspace-1' }),
        select: expect.objectContaining({
          adminLinks: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { telegramUserAccountIntegrationId: true },
          },
        }),
      }),
    );
    expect(prisma.telegramChannelAdminLink.findFirst).not.toHaveBeenCalled();
    expect(broadcastStats.syncBroadcastStatsForWorkspace).toHaveBeenCalledTimes(
      100,
    );
  });

  it('keeps channel failure isolation with the batched admin-link read', async () => {
    const { service, prisma, broadcastStats, completedRun } = setup(2);
    broadcastStats.syncBroadcastStatsForWorkspace
      .mockRejectedValueOnce(new Error('Telegram unavailable'))
      .mockResolvedValueOnce(undefined);
    prisma.dailyAnalyticsSyncRun.update.mockResolvedValue({
      ...completedRun,
      status: 'partial_failed',
    });

    await service.runDailyAnalyticsSync({
      workspaceId: 'workspace-1',
      source: 'manual',
    });

    expect(broadcastStats.syncBroadcastStatsForWorkspace).toHaveBeenCalledTimes(
      2,
    );
    expect(prisma.dailyAnalyticsSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'partial_failed',
          channelsProcessed: 1,
          errorsCount: 1,
        }),
      }),
    );
  });
});
