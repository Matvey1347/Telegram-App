import { CrossPromotionPlanLifecycleService } from './cross-promotion-plan-lifecycle.service';

const duePlan = {
  id: 'plan-1',
  workspaceId: 'workspace-1',
  status: 'SCHEDULED',
  nextDueAt: new Date('2026-09-16T10:00:00.000Z'),
  publicationPost: {
    title: 'Mutual promotion',
    text: 'Post',
    imageUrls: [],
    buttonRows: [],
    publisherPlacements: [
      {
        telegramChannelId: 'channel-1',
        scheduledAt: '2026-09-15T10:00:00.000Z',
        deleteAt: '2026-09-16T10:00:00.000Z',
      },
    ],
  },
  placementPostIds: [
    { telegramChannelId: 'channel-1', managedPostId: 'post-1' },
  ],
};

describe('CrossPromotionPlanLifecycleService', () => {
  it('deletes a due Telegram post and completes its plan', async () => {
    const prisma = {
      crossPromotionPlan: {
        findMany: jest.fn().mockResolvedValue([duePlan]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const remoteDeletion = {
      deletePublishedManagedPosts: jest.fn().mockResolvedValue({
        failed: 0,
        results: [{ postId: 'post-1', success: true }],
      }),
    };
    const service = new CrossPromotionPlanLifecycleService(
      prisma as never,
      remoteDeletion as never,
    );

    await expect(
      service.processDueActions(new Date('2026-09-16T10:00:00.000Z')),
    ).resolves.toMatchObject({ completed: 1, retried: 0 });
    expect(remoteDeletion.deletePublishedManagedPosts).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      managedPostIds: ['post-1'],
    });
    expect(prisma.crossPromotionPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        status: 'COMPLETED',
        nextDueAt: null,
        trackingEndsAt: new Date('2026-09-16T10:00:00.000Z'),
        lastError: null,
      },
    });
  });

  it('keeps a failed Telegram deletion visible and retries it', async () => {
    const now = new Date('2026-09-16T10:00:00.000Z');
    const prisma = {
      crossPromotionPlan: {
        findMany: jest.fn().mockResolvedValue([duePlan]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const remoteDeletion = {
      deletePublishedManagedPosts: jest.fn().mockResolvedValue({
        failed: 1,
        results: [
          { postId: 'post-1', success: false, error: 'Telegram unavailable' },
        ],
      }),
    };
    const service = new CrossPromotionPlanLifecycleService(
      prisma as never,
      remoteDeletion as never,
    );

    await expect(service.processDueActions(now)).resolves.toMatchObject({
      completed: 0,
      retried: 1,
    });
    expect(prisma.crossPromotionPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        status: 'ACTIVE',
        nextDueAt: new Date(now.getTime() + 60_000),
        lastError: 'Telegram unavailable',
      },
    });
  });
});
