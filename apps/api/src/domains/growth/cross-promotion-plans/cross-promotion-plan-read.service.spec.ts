import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';

describe('CrossPromotionPlanReadService', () => {
  it('uses workspace-scoped tracking-end counters for totals and placement deltas', async () => {
    const trackingEndsAt = new Date('2026-09-17T12:00:00.000Z');
    const telegramInviteLinkSnapshot = {
      findMany: jest.fn().mockResolvedValue([
        {
          inviteLinkId: 'link-1',
          syncedAt: new Date('2026-09-17T11:59:00.000Z'),
          joinedCount: 12,
          requestedCount: 4,
        },
        {
          inviteLinkId: 'link-1',
          syncedAt: new Date('2026-09-17T12:30:00.000Z'),
          joinedCount: 15,
          requestedCount: 6,
        },
      ]),
    };
    const service = new CrossPromotionPlanReadService({
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'channel-1',
            title: 'Target',
            photoUrl: null,
            currentSubscribersCount: 100,
          },
        ]),
      },
      promo: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'link-1',
            url: 'https://t.me/+target',
            joinedCount: 99,
            requestedCount: 50,
          },
        ]),
      },
      telegramInviteLinkSnapshot,
      telegramChannelAudienceSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    const result = await service.shape('workspace-1', {
      id: 'plan-1',
      workspaceId: 'workspace-1',
      createdByUserId: 'user-1',
      kind: 'DIRECT_MUTUAL',
      title: 'Plan',
      advertiserId: null,
      status: 'COMPLETED',
      publisherChannelIds: [],
      partnerChannelIds: [],
      targets: [
        {
          telegramChannelId: 'channel-1',
          promoId: null,
          inviteLinkId: 'link-1',
        },
      ],
      publicationPost: {
        title: '',
        text: '',
        imageUrls: [],
        buttonRows: [],
        partnerPlacements: [
          {
            telegramChannelId: 'partner-1',
            scheduledAt: '2026-09-16T10:00:00.000Z',
            deleteAt: '2026-09-17T12:00:00.000Z',
          },
        ],
      },
      scheduledAt: new Date('2026-09-16T12:00:00.000Z'),
      trackingEndsAt,
      nextDueAt: null,
      baselineTargetCounters: [
        { inviteLinkId: 'link-1', joinedCount: 10, requestedCount: 2 },
      ],
      baselinePublisherSubscribers: [],
      placementPostIds: [],
      createdAt: new Date('2026-09-16T10:00:00.000Z'),
      updatedAt: new Date('2026-09-17T12:00:00.000Z'),
    } as never);

    expect(result.targetResults[0]).toEqual(
      expect.objectContaining({
        inviteLinkTotalJoinedCount: 15,
        inviteLinkTotalRequestedCount: 6,
        joinedCount: 5,
        requestedCount: 4,
      }),
    );
    expect(telegramInviteLinkSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          inviteLinkId: { in: ['link-1'] },
          syncedAt: {
            lte: new Date(trackingEndsAt.getTime() + 30 * 3_600_000),
          },
        }),
      }),
    );
  });

  it('presents a past draft with captured attribution baselines as completed', async () => {
    const service = new CrossPromotionPlanReadService({
      telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
      promo: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLinkSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      telegramChannelAudienceSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    const result = await service.shape('workspace-1', {
      id: 'failed-history-plan',
      workspaceId: 'workspace-1',
      createdByUserId: 'user-1',
      kind: 'DIRECT_MUTUAL',
      title: 'Historical plan',
      advertiserId: null,
      status: 'DRAFT',
      lastError: 'Schedule date must be in the future',
      publisherChannelIds: [],
      partnerChannelIds: [],
      targets: [],
      publicationPost: { title: '', text: '', imageUrls: [], buttonRows: [] },
      scheduledAt: new Date('2026-09-14T10:00:00.000Z'),
      trackingEndsAt: null,
      nextDueAt: null,
      baselineTargetCounters: [
        { inviteLinkId: 'link-1', joinedCount: 3, requestedCount: 1 },
      ],
      baselinePublisherSubscribers: [],
      placementPostIds: [],
      createdAt: new Date('2026-09-14T09:00:00.000Z'),
      updatedAt: new Date('2026-09-14T10:00:00.000Z'),
    } as never);

    expect(result.status).toBe('COMPLETED');
    expect(result.lastError).toBeNull();
  });

  it('recovers views for a historical placement whose old failed reschedule lost post ids', async () => {
    const telegramPost = {
      findMany: jest.fn().mockResolvedValue([
        {
          telegramChannelId: 'publisher-1',
          telegramMessageId: '77',
          viewsCount: 321,
          reactionsCount: 9,
        },
      ]),
    };
    const service = new CrossPromotionPlanReadService({
      telegramChannel: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'publisher-1',
            title: 'Publisher',
            photoUrl: null,
            currentSubscribersCount: 100,
          },
        ]),
      },
      promo: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLinkSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      telegramChannelAudienceSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
      telegramPost,
    } as never);

    const result = await service.shape('workspace-1', {
      id: 'recovered-plan',
      workspaceId: 'workspace-1',
      createdByUserId: 'user-1',
      kind: 'DIRECT_MUTUAL',
      title: 'Recovered plan',
      advertiserId: null,
      status: 'COMPLETED',
      publisherChannelIds: ['publisher-1'],
      partnerChannelIds: [],
      targets: [],
      publicationPost: {
        title: 'Partner post',
        text: 'Original placement text',
        imageUrls: [],
        buttonRows: [],
        publisherPlacements: [
          {
            telegramChannelId: 'publisher-1',
            scheduledAt: '2026-09-14T09:00:00.000Z',
          },
        ],
      },
      scheduledAt: new Date('2026-09-14T09:00:00.000Z'),
      trackingEndsAt: null,
      nextDueAt: null,
      baselineTargetCounters: [],
      baselinePublisherSubscribers: [],
      placementPostIds: [],
      createdAt: new Date('2026-09-13T10:00:00.000Z'),
      updatedAt: new Date('2026-09-18T10:00:00.000Z'),
    } as never);

    expect(result.publisherResults[0]).toEqual(
      expect.objectContaining({ postViews: 321, postReactions: 9 }),
    );
    expect(telegramPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest's asymmetric matchers are intentionally untyped at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          OR: expect.arrayContaining([
            expect.objectContaining({
              telegramChannelId: 'publisher-1',
              text: 'Original placement text',
            }),
          ]),
        }),
      }),
    );
  });
});
