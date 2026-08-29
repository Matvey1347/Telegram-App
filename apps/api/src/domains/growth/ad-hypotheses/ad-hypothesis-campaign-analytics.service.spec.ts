import { NotFoundException } from '@nestjs/common';
import { AdHypothesisCampaignAnalyticsService } from './ad-hypothesis-campaign-analytics.service';

describe('AdHypothesisCampaignAnalyticsService', () => {
  const campaignIds = Array.from(
    { length: 100 },
    (_, index) => `campaign-${String(index + 1).padStart(3, '0')}`,
  );

  const setup = (
    hypothesis: { id: string } | null = { id: 'hypothesis-1' },
  ) => {
    const tx = {
      adHypothesis: { findFirst: jest.fn().mockResolvedValue(hypothesis) },
      adHypothesisCampaign: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            campaignIds.map((adCampaignId) => ({ adCampaignId })),
          ),
      },
      adCampaign: { updateMany: jest.fn().mockResolvedValue({ count: 100 }) },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const workspaceService = {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    };
    return {
      tx,
      prisma,
      workspaceService,
      service: new AdHypothesisCampaignAnalyticsService(
        prisma as never,
        workspaceService as never,
      ),
    };
  };

  it('atomically updates 100 linked campaigns with constant database operations', async () => {
    const { service, tx, prisma, workspaceService } = setup();

    await expect(
      service.update('user-1', 'hypothesis-1', {
        excludeFromAnalytics: true,
      }),
    ).resolves.toEqual({
      hypothesisId: 'hypothesis-1',
      campaignIds,
      updatedCount: 100,
      excludeFromAnalytics: true,
    });

    expect(workspaceService.resolveWorkspaceIdForUser).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.adHypothesis.findFirst).toHaveBeenCalledWith({
      where: { id: 'hypothesis-1', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(tx.adHypothesisCampaign.findMany).toHaveBeenCalledTimes(1);
    expect(tx.adCampaign.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', id: { in: campaignIds } },
      data: { excludeFromAnalytics: true },
    });
  });

  it('does not inspect or update campaigns when the hypothesis is outside the workspace', async () => {
    const { service, tx } = setup(null);

    await expect(
      service.update('user-1', 'hypothesis-1', {
        excludeFromAnalytics: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.adHypothesisCampaign.findMany).not.toHaveBeenCalled();
    expect(tx.adCampaign.updateMany).not.toHaveBeenCalled();
  });
});
