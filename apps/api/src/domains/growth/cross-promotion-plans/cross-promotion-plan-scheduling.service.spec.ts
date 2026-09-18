import { CrossPromotionPlanSchedulingService } from './cross-promotion-plan-scheduling.service';

const payload = {
  kind: 'DIRECT_MUTUAL' as const,
  title: 'Mutual promotion',
  publisherChannelIds: ['channel-1', 'channel-2'],
  partnerChannelIds: ['partner-1'],
  targets: [
    {
      telegramChannelId: 'target-1',
      promoId: 'promo-1',
      inviteLinkId: 'link-1',
    },
  ],
  publicationPost: {
    title: 'Partner post',
    text: 'Text',
    imageUrls: [],
    buttonRows: [
      [
        {
          text: 'Join',
          url: 'https://t.me/example',
          style: 'default' as const,
        },
      ],
    ],
    publisherPlacements: [
      {
        telegramChannelId: 'channel-1',
        scheduledAt: '2026-09-15T08:00:00.000Z',
      },
      {
        telegramChannelId: 'channel-2',
        scheduledAt: '2026-09-15T09:00:00.000Z',
      },
    ],
  },
  scheduledAt: '2026-09-15T08:00:00.000Z',
};

function setup() {
  const plan = { id: 'plan-1' };
  const plans = {
    validateForScheduling: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(plan),
    savePlacements: jest
      .fn()
      .mockResolvedValue({ ...plan, status: 'SCHEDULED' }),
    remove: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    removalContext: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      remotePostIds: [],
    }),
    placementsForReschedule: jest.fn().mockResolvedValue([
      {
        telegramChannelId: 'old-channel',
        managedPostId: 'old-post',
        postGroupId: 'old-group',
      },
    ]),
    markRescheduling: jest.fn().mockResolvedValue(undefined),
    replaceScheduled: jest
      .fn()
      .mockResolvedValue({ ...plan, status: 'SCHEDULED' }),
  };
  const telegram = {
    createManagedPost: jest
      .fn()
      .mockResolvedValueOnce({ id: 'post-1' })
      .mockResolvedValueOnce({ id: 'post-2' }),
    scheduleManagedPost: jest.fn().mockResolvedValue({}),
    deleteManagedPost: jest.fn().mockResolvedValue({}),
  };
  const systemPostGroups = {
    ensureMutualPromotionGroup: jest
      .fn()
      .mockResolvedValueOnce({ id: 'group-1' })
      .mockResolvedValueOnce({ id: 'group-2' }),
  };
  const remoteDeletion = {
    deletePublishedManagedPosts: jest.fn(),
  };
  return {
    service: new CrossPromotionPlanSchedulingService(
      plans as never,
      telegram as never,
      systemPostGroups as never,
      remoteDeletion as never,
    ),
    plans,
    telegram,
    systemPostGroups,
    remoteDeletion,
  };
}

describe('CrossPromotionPlanSchedulingService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-14T08:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('streams channel progress and persists a plan only after every post is scheduled', async () => {
    const { service, plans, telegram, systemPostGroups } = setup();
    const progress = jest.fn();

    await service.createAndSchedule(
      'user-1',
      payload,
      progress,
      new AbortController().signal,
    );

    expect(telegram.scheduleManagedPost).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'channel-2',
      'post-2',
      { scheduledAt: '2026-09-15T09:00:00.000Z' },
    );
    expect(systemPostGroups.ensureMutualPromotionGroup).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'channel-1',
    );
    expect(telegram.createManagedPost).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'channel-1',
      {
        title: 'Partner post',
        text: 'Text',
        imageUrls: [],
        mediaItems: [],
        buttonRows: [
          [
            {
              text: 'Join',
              url: 'https://t.me/example',
              style: 'default',
            },
          ],
        ],
      },
      { groupId: 'group-1' },
    );
    expect(telegram.createManagedPost.mock.invocationCallOrder[1]).toBeLessThan(
      plans.create.mock.invocationCallOrder[0],
    );
    expect(plans.savePlacements).toHaveBeenCalledWith('user-1', 'plan-1', {
      placements: [
        {
          telegramChannelId: 'channel-1',
          managedPostId: 'post-1',
          postGroupId: 'group-1',
        },
        {
          telegramChannelId: 'channel-2',
          managedPostId: 'post-2',
          postGroupId: 'group-2',
        },
      ],
      lastError: null,
    });
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'SCHEDULING', success: true }),
      2,
      4,
    );
  });

  it('rolls back created posts and never creates a plan when Telegram scheduling fails', async () => {
    const { service, plans, telegram, systemPostGroups } = setup();
    telegram.scheduleManagedPost.mockRejectedValueOnce(
      new Error('Telegram rejected scheduling'),
    );

    await expect(
      service.createAndSchedule(
        'user-1',
        payload,
        jest.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('Telegram rejected scheduling');

    expect(plans.create).not.toHaveBeenCalled();
    expect(telegram.deleteManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'post-1',
    );
    expect(systemPostGroups.ensureMutualPromotionGroup).toHaveBeenCalledTimes(
      1,
    );
  });

  it('rejects a past replacement before it can remove posts or change the plan status', async () => {
    const { service, plans, telegram } = setup();
    jest.setSystemTime(new Date('2026-09-18T08:00:00.000Z'));

    await expect(
      service.replaceAndSchedule(
        'user-1',
        'plan-1',
        payload,
        jest.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('Historical promotions must be updated');

    expect(plans.markRescheduling).not.toHaveBeenCalled();
    expect(telegram.deleteManagedPost).not.toHaveBeenCalled();
  });

  it('removes the plan and scheduled posts when final persistence fails', async () => {
    const { service, plans, telegram } = setup();
    plans.savePlacements.mockRejectedValueOnce(new Error('Persistence failed'));

    await expect(
      service.createAndSchedule(
        'user-1',
        payload,
        jest.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('Persistence failed');

    expect(telegram.deleteManagedPost).toHaveBeenCalledTimes(2);
    expect(plans.remove).toHaveBeenCalledWith('user-1', 'plan-1');
  });

  it('cancels the old scheduled post and reuses permanent mutual-promotion groups', async () => {
    const { service, plans, telegram } = setup();

    await service.replaceAndSchedule(
      'user-1',
      'plan-1',
      payload,
      jest.fn(),
      new AbortController().signal,
    );

    expect(telegram.deleteManagedPost).toHaveBeenCalledWith(
      'user-1',
      'old-channel',
      'old-post',
    );
    expect(plans.markRescheduling).toHaveBeenCalledWith(
      'user-1',
      'plan-1',
      'Rescheduling in progress',
    );
    expect(plans.replaceScheduled).toHaveBeenCalledWith(
      'user-1',
      'plan-1',
      payload,
      [
        {
          telegramChannelId: 'channel-1',
          managedPostId: 'post-1',
          postGroupId: 'group-1',
        },
        {
          telegramChannelId: 'channel-2',
          managedPostId: 'post-2',
          postGroupId: 'group-2',
        },
      ],
    );
  });

  it('keeps a failed edit as a truthful draft without deleting shared system groups', async () => {
    const { service, plans, telegram, systemPostGroups } = setup();
    telegram.scheduleManagedPost.mockRejectedValueOnce(
      new Error('Telegram rejected edited schedule'),
    );

    await expect(
      service.replaceAndSchedule(
        'user-1',
        'plan-1',
        payload,
        jest.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow('Telegram rejected edited schedule');

    expect(telegram.deleteManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'post-1',
    );
    expect(systemPostGroups.ensureMutualPromotionGroup).toHaveBeenCalledTimes(
      1,
    );
    expect(plans.markRescheduling).toHaveBeenLastCalledWith(
      'user-1',
      'plan-1',
      'Telegram rejected edited schedule',
    );
  });
});
