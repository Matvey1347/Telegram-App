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
        deleteAt: '2026-09-17T08:00:00.000Z',
      },
      {
        telegramChannelId: 'channel-2',
        scheduledAt: '2026-09-15T09:00:00.000Z',
        deleteAt: '2026-09-16T09:00:00.000Z',
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
        publicationId: 'legacy-publisher-publication',
      },
    ]),
    publicationScheduleForUpdate: jest.fn().mockResolvedValue([
      {
        telegramChannelId: 'channel-1',
        scheduledAt: '2026-09-15T08:00:00.000Z',
      },
      {
        telegramChannelId: 'channel-2',
        scheduledAt: '2026-09-15T09:00:00.000Z',
      },
    ]),
    markRescheduling: jest.fn().mockResolvedValue(undefined),
    resumeSchedulingContext: jest.fn().mockResolvedValue({
      dto: payload,
      placements: [
        {
          telegramChannelId: 'channel-1',
          managedPostId: 'post-1',
          postGroupId: 'group-1',
        },
      ],
    }),
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
    publishManagedPostNow: jest.fn().mockResolvedValue({}),
    deleteManagedPost: jest.fn().mockResolvedValue({}),
    updateManagedPost: jest.fn().mockResolvedValue({}),
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

  it('persists a plan before scheduling and checkpoints every scheduled channel', async () => {
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
        deleteAfterHours: 48,
      },
      { groupId: 'group-1' },
    );
    expect(plans.create.mock.invocationCallOrder[0]).toBeLessThan(
      telegram.createManagedPost.mock.invocationCallOrder[0],
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

  it('schedules several partner posts in one channel at their individual slots', async () => {
    const { service, telegram } = setup();
    const multiPostPayload = {
      ...payload,
      publisherChannelIds: ['channel-1'],
      publicationPost: {
        ...payload.publicationPost,
        publisherPublications: [
          {
            id: 'partner-post-1',
            post: {
              title: 'First',
              text: 'First partner promo',
              imageUrls: [],
              buttonRows: [],
            },
            placements: [
              {
                telegramChannelId: 'channel-1',
                scheduledAt: '2026-09-15T08:00:00.000Z',
              },
            ],
          },
          {
            id: 'partner-post-2',
            post: {
              title: 'Second',
              text: 'Second partner promo',
              imageUrls: [],
              buttonRows: [],
            },
            placements: [
              {
                telegramChannelId: 'channel-1',
                scheduledAt: '2026-09-15T12:00:00.000Z',
              },
            ],
          },
        ],
      },
    };

    await service.createAndSchedule(
      'user-1',
      multiPostPayload,
      jest.fn(),
      new AbortController().signal,
    );

    expect(telegram.createManagedPost).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'channel-1',
      expect.objectContaining({
        title: 'Second',
        text: 'Second partner promo',
      }),
      expect.any(Object),
    );
    expect(telegram.scheduleManagedPost).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'channel-1',
      'post-2',
      { scheduledAt: '2026-09-15T12:00:00.000Z' },
    );
  });

  it('does not persist a new time while updating an existing Telegram publication', async () => {
    const { service, plans, telegram } = setup();
    const changedTime = {
      ...payload,
      publicationPost: {
        ...payload.publicationPost,
        publisherPlacements: payload.publicationPost.publisherPlacements.map(
          (placement) => ({
            ...placement,
            scheduledAt: '2026-09-15T12:00:00.000Z',
          }),
        ),
      },
    };

    await expect(
      service.updatePublicationInTelegram(
        'user-1',
        'plan-1',
        'legacy-publisher-publication',
        changedTime,
      ),
    ).rejects.toThrow('time cannot be changed in place');

    expect(plans.publicationScheduleForUpdate).toHaveBeenCalledWith(
      'user-1',
      'plan-1',
      'legacy-publisher-publication',
    );
    expect(telegram.updateManagedPost).not.toHaveBeenCalled();
  });

  it('keeps a resumable plan when Telegram scheduling fails', async () => {
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

    expect(plans.create).toHaveBeenCalled();
    expect(telegram.deleteManagedPost).not.toHaveBeenCalled();
    expect(plans.savePlacements).toHaveBeenLastCalledWith(
      'user-1',
      'plan-1',
      expect.objectContaining({
        placements: [],
        lastError: 'Telegram rejected scheduling',
      }),
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
    ).rejects.toThrow('Every publishing post must be scheduled in the future');

    expect(plans.markRescheduling).not.toHaveBeenCalled();
    expect(telegram.deleteManagedPost).not.toHaveBeenCalled();
  });

  it('uses each publisher placement time when replacing a plan', async () => {
    const { service, plans, telegram } = setup();
    jest.setSystemTime(new Date('2026-09-18T08:00:00.000Z'));
    const editedPayload = {
      ...payload,
      // This is the old default value retained for tracking/display. The
      // actual posts below are explicitly scheduled for a future time.
      scheduledAt: '2026-09-15T08:00:00.000Z',
      publicationPost: {
        ...payload.publicationPost,
        publisherPlacements: payload.publicationPost.publisherPlacements.map(
          (placement, index) => ({
            ...placement,
            scheduledAt: `2026-09-20T0${8 + index}:00:00.000Z`,
          }),
        ),
      },
    };

    await service.replaceAndSchedule(
      'user-1',
      'plan-1',
      editedPayload,
      jest.fn(),
      new AbortController().signal,
    );

    expect(plans.markRescheduling).toHaveBeenCalledWith(
      'user-1',
      'plan-1',
      'Rescheduling in progress',
    );
    expect(telegram.scheduleManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'post-1',
      { scheduledAt: '2026-09-20T08:00:00.000Z' },
    );
  });

  it('deletes active remote posts and publishes their replacements immediately', async () => {
    const { service, plans, telegram, remoteDeletion } = setup();
    remoteDeletion.deletePublishedManagedPosts.mockResolvedValue({
      failed: false,
      results: [{ success: true }],
    });

    await service.replaceAndPublishNow(
      'user-1',
      'plan-1',
      payload,
      jest.fn(),
      new AbortController().signal,
    );

    expect(remoteDeletion.deletePublishedManagedPosts).not.toHaveBeenCalled();
    expect(telegram.deleteManagedPost).toHaveBeenCalledWith(
      'user-1',
      'old-channel',
      'old-post',
    );
    expect(plans.placementsForReschedule).toHaveBeenCalledWith(
      'user-1',
      'plan-1',
    );
    expect(telegram.publishManagedPostNow).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'post-1',
      {},
    );
    expect(plans.replaceScheduled).toHaveBeenCalledWith(
      'user-1',
      'plan-1',
      expect.objectContaining({ scheduledAt: expect.any(String) }),
      expect.any(Array),
      'ACTIVE',
    );
  });

  it('does not delete a Telegram post twice after remote deletion succeeds', async () => {
    const { service, plans, telegram, remoteDeletion } = setup();
    plans.removalContext.mockResolvedValue({
      workspaceId: 'workspace-1',
      remotePostIds: ['old-post'],
    });
    remoteDeletion.deletePublishedManagedPosts.mockResolvedValue({
      failed: false,
      deleted: 1,
      skipped: 0,
      results: [{ postId: 'old-post', success: true }],
    });
    const progress = jest.fn();

    await service.replaceAndPublishNow(
      'user-1',
      'plan-1',
      payload,
      progress,
      new AbortController().signal,
    );

    expect(remoteDeletion.deletePublishedManagedPosts).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      managedPostIds: ['old-post'],
    });
    expect(telegram.deleteManagedPost).not.toHaveBeenCalledWith(
      'user-1',
      'old-channel',
      'old-post',
    );
    expect(telegram.publishManagedPostNow).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'DELETING',
        message: 'Deleted 1 of 1 existing posts',
        success: true,
      }),
      2,
      expect.any(Number),
    );
  });

  it('keeps the plan for retry when a progress checkpoint cannot be saved', async () => {
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

    expect(telegram.deleteManagedPost).not.toHaveBeenCalled();
    expect(plans.remove).not.toHaveBeenCalled();
  });

  it('resumes only channels without a saved managed post', async () => {
    const { service, plans, telegram, systemPostGroups } = setup();
    telegram.createManagedPost.mockReset().mockResolvedValue({ id: 'post-2' });
    systemPostGroups.ensureMutualPromotionGroup
      .mockReset()
      .mockResolvedValue({ id: 'group-2' });

    await service.resume(
      'user-1',
      'plan-1',
      jest.fn(),
      new AbortController().signal,
    );

    expect(telegram.createManagedPost).toHaveBeenCalledTimes(1);
    expect(telegram.createManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-2',
      expect.any(Object),
      { groupId: 'group-2' },
    );
    expect(telegram.scheduleManagedPost).toHaveBeenCalledTimes(1);
    expect(plans.savePlacements).toHaveBeenLastCalledWith('user-1', 'plan-1', {
      placements: [
        expect.objectContaining({ telegramChannelId: 'channel-1' }),
        expect.objectContaining({ telegramChannelId: 'channel-2' }),
      ],
      lastError: null,
    });
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

    expect(telegram.deleteManagedPost).not.toHaveBeenCalledWith(
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
