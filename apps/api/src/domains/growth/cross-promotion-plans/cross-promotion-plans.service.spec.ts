import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CrossPromotionPlansService } from './cross-promotion-plans.service';
import { CrossPromotionPlanReadService } from './cross-promotion-plan-read.service';

const payload = {
  kind: 'DIRECT_MUTUAL' as const,
  title: 'Mentor ↔ Partner',
  publisherChannelIds: ['publisher-1'],
  partnerChannelIds: ['partner-1'],
  targets: [
    {
      telegramChannelId: 'target-1',
      promoId: 'promo-1',
      inviteLinkId: 'link-1',
    },
  ],
  publicationPost: {
    iconId: 'icon-1',
    title: 'Partner post',
    text: 'Partner content',
    imageUrls: [],
    buttonRows: [],
  },
  scheduledAt: '2026-09-15T08:00:00.000Z',
};

function setup() {
  const row = {
    id: 'plan-1',
    workspaceId: 'workspace-1',
    createdByUserId: 'user-1',
    status: 'DRAFT',
    trackingEndsAt: null,
    placementPostIds: [],
    baselineTargetCounters: [
      { inviteLinkId: 'link-1', joinedCount: 10, requestedCount: 2 },
    ],
    baselinePublisherSubscribers: [
      { telegramChannelId: 'publisher-1', subscribersCount: 1000 },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...payload,
    scheduledAt: new Date(payload.scheduledAt),
  };
  const prisma = {
    telegramChannel: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ select }: { select?: Record<string, unknown> }) => {
            if (select?.adminLinks) {
              return [
                { id: 'publisher-1', adminLinks: [{ id: 'admin-1' }] },
                { id: 'partner-1', adminLinks: [] },
                { id: 'target-1', adminLinks: [{ id: 'admin-2' }] },
              ];
            }
            if (select?.title) {
              return [
                {
                  id: 'publisher-1',
                  title: 'Publisher',
                  photoUrl: null,
                  currentSubscribersCount: 995,
                },
                {
                  id: 'partner-1',
                  title: 'Partner',
                  photoUrl: null,
                  currentSubscribersCount: 2000,
                },
                {
                  id: 'target-1',
                  title: 'Target',
                  photoUrl: null,
                  currentSubscribersCount: 500,
                },
              ];
            }
            return [{ id: 'publisher-1', currentSubscribersCount: 1000 }];
          },
        ),
    },
    promo: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ select }: { select?: Record<string, unknown> }) =>
            select?.telegramChannelId
              ? [{ id: 'promo-1', telegramChannelId: 'target-1' }]
              : [{ id: 'promo-1', title: 'Target promo' }],
        ),
    },
    telegramInviteLink: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ select }: { select?: Record<string, unknown> }) =>
            select?.telegramChannelId
              ? [
                  {
                    id: 'link-1',
                    telegramChannelId: 'target-1',
                    joinedCount: 10,
                    requestedCount: 2,
                  },
                ]
              : [
                  {
                    id: 'link-1',
                    url: 'https://t.me/+track',
                    joinedCount: 14,
                    requestedCount: 3,
                  },
                ],
        ),
    },
    telegramInviteLinkSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    telegramChannelAudienceSnapshot: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
    telegramPost: { findMany: jest.fn().mockResolvedValue([]) },
    telegramAdvertiser: {
      findFirst: jest.fn().mockResolvedValue({ id: 'advertiser-1' }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'advertiser-1',
          displayName: 'Partner client',
          telegramUsername: '@partner',
          crmPeers: [
            { photoUrl: null },
            { photoUrl: 'https://cdn.example/client.jpg' },
          ],
        },
      ]),
    },
    icon: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'icon-1',
          type: 'emoji',
          name: 'Handshake',
          emoji: '🤝',
          imageUrl: null,
        },
      ]),
    },
    crossPromotionPlan: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'plan-1',
        placementPostIds: [],
      }),
      create: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: { advertiserId?: string | null } }) =>
            Promise.resolve({
              ...row,
              advertiserId: data.advertiserId ?? null,
            }),
        ),
      updateMany: jest.fn(),
      delete: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    },
  };
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  return {
    service: new CrossPromotionPlansService(
      prisma as never,
      workspace as never,
      new CrossPromotionPlanReadService(prisma as never),
    ),
    prisma,
  };
}

describe('CrossPromotionPlansService', () => {
  it('captures tracking baselines and returns observable joins and donor losses', async () => {
    const { service, prisma } = setup();
    const result = await service.create('user-1', payload);
    expect(prisma.crossPromotionPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          workspaceId: 'workspace-1',
          baselineTargetCounters: [
            { inviteLinkId: 'link-1', joinedCount: 10, requestedCount: 2 },
          ],
          baselinePublisherSubscribers: [
            { telegramChannelId: 'publisher-1', subscribersCount: 1000 },
          ],
        }),
      }),
    );
    expect(result.targetResults[0].joinedCount).toBe(4);
    expect(result.targetResults[0].requestedCount).toBe(1);
    expect(result.publisherResults[0].subscribersLost).toBe(5);
    expect(result.iconPresentation).toEqual(
      expect.objectContaining({ type: 'unicode', value: '🤝' }),
    );
    expect(result.partnerResults).toEqual([
      {
        telegramChannelId: 'partner-1',
        title: 'Partner',
        photoUrl: null,
      },
    ]);
  });

  it('rejects channels outside the current workspace', async () => {
    const { service, prisma } = setup();
    prisma.telegramChannel.findMany.mockResolvedValueOnce([
      { id: 'publisher-1', adminLinks: [{ id: 'admin-1' }] },
    ]);
    await expect(service.create('user-1', payload)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires a partner channel for direct mutual promotion', async () => {
    const { service } = setup();
    await expect(
      service.create('user-1', { ...payload, partnerChannelIds: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('links the mutual promotion to a workspace CRM client', async () => {
    const { service, prisma } = setup();
    const result = await service.create('user-1', {
      ...payload,
      advertiserId: 'advertiser-1',
    });

    expect(prisma.telegramAdvertiser.findFirst).toHaveBeenCalledWith({
      where: { id: 'advertiser-1', workspaceId: 'workspace-1' },
      select: { id: true },
    });
    expect(prisma.crossPromotionPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are intentionally dynamic at this assertion boundary.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ advertiserId: 'advertiser-1' }),
      }),
    );
    expect(result.advertiser).toEqual({
      id: 'advertiser-1',
      displayName: 'Partner client',
      telegramUsername: '@partner',
      photoUrl: 'https://cdn.example/client.jpg',
    });
  });

  it('rejects a CRM client from another workspace', async () => {
    const { service, prisma } = setup();
    prisma.telegramAdvertiser.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.create('user-1', {
        ...payload,
        advertiserId: 'outside-advertiser',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a custom partner placement without an imported or composed promo post', async () => {
    const { service } = setup();
    await expect(
      service.create('user-1', {
        ...payload,
        targets: [
          {
            telegramChannelId: 'target-1',
            promoId: null,
            inviteLinkId: 'link-1',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ends tracking for an earlier placement when the same channel is promoted again', async () => {
    const { service, prisma } = setup();
    prisma.crossPromotionPlan.findMany.mockResolvedValueOnce([
      {
        id: 'previous-plan',
        targets: [
          {
            telegramChannelId: 'target-1',
            promoId: 'older-promo',
            inviteLinkId: 'older-link',
          },
        ],
      },
      {
        id: 'unrelated-plan',
        targets: [
          {
            telegramChannelId: 'another-target',
            promoId: 'another-promo',
            inviteLinkId: 'another-link',
          },
        ],
      },
    ]);

    await service.create('user-1', payload);

    expect(prisma.crossPromotionPlan.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', id: { in: ['previous-plan'] } },
      data: {
        trackingEndsAt: new Date(payload.scheduledAt),
        status: 'COMPLETED',
      },
    });
  });

  it('deletes an unscheduled draft inside the current workspace', async () => {
    const { service, prisma } = setup();

    await expect(service.remove('user-1', 'plan-1')).resolves.toEqual({
      id: 'plan-1',
    });
    expect(prisma.crossPromotionPlan.findFirst).toHaveBeenCalledWith({
      where: { id: 'plan-1', workspaceId: 'workspace-1' },
      select: { id: true, placementPostIds: true },
    });
    expect(prisma.crossPromotionPlan.delete).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
    });
  });

  it('does not delete a plan while it still owns scheduled posts', async () => {
    const { service, prisma } = setup();
    prisma.crossPromotionPlan.findFirst.mockResolvedValueOnce({
      id: 'plan-1',
      placementPostIds: [
        { telegramChannelId: 'publisher-1', managedPostId: 'post-1' },
      ],
    });

    await expect(service.remove('user-1', 'plan-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.crossPromotionPlan.delete).not.toHaveBeenCalled();
  });

  it('returns grouped placements when a future scheduled promotion is edited', async () => {
    const { service, prisma } = setup();
    prisma.crossPromotionPlan.findFirst.mockResolvedValueOnce({
      id: 'plan-1',
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() + 60_000),
      placementPostIds: [
        {
          telegramChannelId: 'publisher-1',
          managedPostId: 'post-1',
          postGroupId: 'group-1',
        },
      ],
    });

    await expect(
      service.placementsForReschedule('user-1', 'plan-1'),
    ).resolves.toEqual([
      {
        telegramChannelId: 'publisher-1',
        managedPostId: 'post-1',
        postGroupId: 'group-1',
      },
    ]);
  });

  it('does not reschedule a promotion after publication has started', async () => {
    const { service, prisma } = setup();
    prisma.crossPromotionPlan.findFirst.mockResolvedValueOnce({
      id: 'plan-1',
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() - 60_000),
      placementPostIds: [],
    });

    await expect(
      service.placementsForReschedule('user-1', 'plan-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
