import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';

describe('CrossPromotionPlanReadService', () => {
  it.each(['OWN_CHANNELS', 'DIRECT_MUTUAL'])(
    'keeps a %s placement scheduled until Telegram confirms a published message',
    async (kind) => {
      const managedPosts = [
        {
          id: 'post-1',
          telegramChannelId: 'channel-1',
          telegramMessageIds: [] as string[],
          telegramRemoteStatus: 'PUBLISHED',
          publishedAt: null as Date | null,
        },
      ];
      const service = new CrossPromotionPlanReadService({
        telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
        promo: { findMany: jest.fn().mockResolvedValue([]) },
        telegramInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
        telegramInviteLinkSnapshot: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        telegramChannelAudienceSnapshot: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        telegramManagedPost: {
          findMany: jest
            .fn()
            .mockImplementation(() => Promise.resolve(managedPosts)),
        },
        telegramPost: { findMany: jest.fn().mockResolvedValue([]) },
      } as never);
      const plan = {
        id: 'plan-1',
        workspaceId: 'workspace-1',
        createdByUserId: 'user-1',
        kind,
        title: 'Own channels',
        advertiserId: null,
        status: 'SCHEDULED',
        publisherChannelIds: ['channel-1'],
        partnerChannelIds: [],
        targets: [],
        publicationPost: { title: '', text: '', imageUrls: [], buttonRows: [] },
        scheduledAt: new Date('2020-01-01T08:10:00.000Z'),
        trackingEndsAt: null,
        nextDueAt: null,
        baselineTargetCounters: [],
        baselinePublisherSubscribers: [],
        placementPostIds: [
          { telegramChannelId: 'channel-1', managedPostId: 'post-1' },
        ],
        createdAt: new Date('2020-01-01T08:00:00.000Z'),
        updatedAt: new Date('2020-01-01T08:00:00.000Z'),
      } as Record<string, unknown>;

      expect((await service.shape('workspace-1', plan as never)).status).toBe(
        'SCHEDULED',
      );
      expect(
        (
          await service.shape('workspace-1', {
            ...plan,
            status: 'ACTIVE',
          } as never)
        ).status,
      ).toBe('SCHEDULED');
      managedPosts[0].telegramMessageIds.push('42');
      const expectedStatus = kind === 'OWN_CHANNELS' ? 'COMPLETED' : 'ACTIVE';
      expect((await service.shape('workspace-1', plan as never)).status).toBe(
        expectedStatus,
      );
      if (kind === 'OWN_CHANNELS') {
        managedPosts[0].publishedAt = new Date(Date.now() - 23 * 60 * 60 * 1000);
        expect((await service.shape('workspace-1', plan as never)).status).toBe(
          'ACTIVE',
        );
        managedPosts[0].publishedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
        expect((await service.shape('workspace-1', plan as never)).status).toBe(
          'COMPLETED',
        );
        managedPosts[0].publishedAt = null;
      }
      // A Telegram copy can remain visible after campaign tracking ends.
      for (const status of ['ACTIVE', 'COMPLETED']) {
        const result = await service.shape('workspace-1', {
          ...plan,
          status,
          trackingEndsAt: new Date('2020-01-03T08:10:00.000Z'),
        } as never);
        expect(result.status).toBe('COMPLETED');
        expect(result.placementPostIds[0].isPublishedInTelegram).toBe(true);
      }
      const legacyEndedPlacement = await service.shape('workspace-1', {
        ...plan,
        status: 'ACTIVE',
        publicationPost: {
          ...(plan.publicationPost as object),
          publisherPublications: [{
            id: 'promotion-1',
            placements: [{
              telegramChannelId: 'channel-1',
              scheduledAt: '2020-01-01T08:10:00.000Z',
              deleteAt: '2020-01-03T08:10:00.000Z',
            }],
          }],
        },
      } as never);
      expect(legacyEndedPlacement.status).toBe('COMPLETED');
      expect((await service.shape('workspace-1', {
        ...plan,
        status: 'COMPLETED',
      } as never)).status).toBe('COMPLETED');
      managedPosts[0].telegramRemoteStatus = 'AUTO_DELETED';
      expect((await service.shape('workspace-1', plan as never)).status).toBe(
        'SCHEDULED',
      );
    },
  );

  it.each([
    ['2099-01-01T10:00:00.000Z', null],
    ['2026-09-28T10:00:00.000Z', 7_843],
  ])('counts each published placement once, including albums (%s)', async (scheduledAt, expectedViews) => {
    const service = new CrossPromotionPlanReadService({
      telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
      promo: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLink: { findMany: jest.fn().mockResolvedValue([]) },
      telegramInviteLinkSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      telegramChannelAudienceSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'post-1',
            telegramChannelId: 'channel-1',
            telegramMessageIds: ['42', '43'],
            telegramRemoteStatus: 'PUBLISHED',
          },
          {
            id: 'post-2',
            telegramChannelId: 'channel-1',
            telegramMessageIds: ['44'],
            telegramRemoteStatus: 'PUBLISHED',
          },
        ]),
      },
      telegramPost: {
        findMany: jest.fn().mockResolvedValue([
          {
            telegramChannelId: 'channel-1',
            telegramMessageId: '42',
            viewsCount: 3943,
            reactionsCount: 0,
          },
          { telegramChannelId: 'channel-1', telegramMessageId: '43', viewsCount: 3943, reactionsCount: 0 },
          { telegramChannelId: 'channel-1', telegramMessageId: '44', viewsCount: 3900, reactionsCount: 0 },
        ]),
      },
    } as never);

    const result = await service.shape('workspace-1', {
      id: 'plan-1',
      workspaceId: 'workspace-1',
      createdByUserId: 'user-1',
      kind: 'DIRECT_MUTUAL',
      title: 'Future placement',
      advertiserId: null,
      status: 'SCHEDULED',
      publisherChannelIds: ['channel-1'],
      partnerChannelIds: [],
      targets: [],
      publicationPost: {
        title: '',
        text: '',
        imageUrls: [],
        buttonRows: [],
        publisherPlacements: [
          {
            telegramChannelId: 'channel-1',
            scheduledAt,
          },
        ],
      },
      scheduledAt: new Date(scheduledAt),
      trackingEndsAt: null,
      nextDueAt: null,
      baselineTargetCounters: [],
      baselinePublisherSubscribers: [],
      placementPostIds: [
        { telegramChannelId: 'channel-1', managedPostId: 'post-1' },
        { telegramChannelId: 'channel-1', managedPostId: 'post-2' },
      ],
      createdAt: new Date('2026-09-28T10:00:00.000Z'),
      updatedAt: new Date('2026-09-28T10:00:00.000Z'),
    } as never);

    expect(result.publisherResults[0].postViews).toBe(expectedViews);
  });

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
        inviteLinkId: 'link-1',
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
          text: 'Original placement text',
          postDate: new Date('2026-09-14T09:00:00.000Z'),
          viewsCount: 321,
          reactionsCount: 9,
        },
        {
          telegramChannelId: 'publisher-1',
          telegramMessageId: '78',
          text: 'Original placement text',
          postDate: new Date('2026-09-15T09:00:00.000Z'),
          viewsCount: 400,
          reactionsCount: 5,
        },
        {
          telegramChannelId: 'publisher-1',
          telegramMessageId: '79',
          text: 'Different campaign on the same channel',
          postDate: new Date('2026-09-14T09:00:00.000Z'),
          viewsCount: 900,
          reactionsCount: 4,
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
          {
            telegramChannelId: 'publisher-1',
            scheduledAt: '2026-09-15T09:00:00.000Z',
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
      expect.objectContaining({ postViews: 721, postReactions: 14 }),
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
