import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { TelegramManagedPostScheduledResetService } from './telegram-managed-post-scheduled-reset.service';
import { TelegramManagedPostReschedulerService } from './telegram-managed-post-rescheduler.service';

function scheduledPost(id = 'post-1') {
  return {
    id,
    workspaceId: 'workspace-1',
    telegramChannelId: 'channel-1',
    title: `Post ${id}`,
    text: 'Body',
    imageUrls: [],
    buttonRows: null,
    origin: 'SYSTEM',
    remoteImportKey: `remote-${id}`,
    jsonImportKey: null,
    status: TelegramManagedPostStatus.SCHEDULED,
    scheduledAt: new Date('2026-09-01T08:00:00.000Z'),
    scheduleMode: 'TELEGRAM_NATIVE',
    publishedAt: null,
    telegramScheduledMessageIds: ['101'],
    telegramMessageIds: ['101'],
    telegramMessageUrls: ['https://t.me/c/123/101'],
    telegramIdVerificationStatus: 'VERIFIED',
    telegramLinkSource: 'AUTO',
    telegramIdVerifiedAt: new Date('2026-08-25T08:00:00.000Z'),
    telegramIdLastCheckedAt: new Date('2026-08-25T08:00:00.000Z'),
    telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
    lastTelegramSyncedAt: null,
    lastTelegramSyncNote: null,
    sourceType: TelegramSourceType.MTPROTO,
    sourceId: 'account-1',
    sourceWasPremium: false,
    captionLengthMaxUsed: 1024,
    messageLengthMaxUsed: 4096,
    publishMode: 'TEXT_ONLY',
    lastError: 'Old error',
    plannerFormatId: null,
    plannerSlotId: null,
    plannerRunId: null,
    plannerPlannedAt: null,
    plannerProvenance: null,
    assignedMemberId: 'member-1',
    icon: null,
    groupId: 'group-1' as string | null,
    groupPosition: 0,
    statusPosition: 0,
    sidebarPosition: 0,
    createdAt: new Date('2026-08-20T08:00:00.000Z'),
    updatedAt: new Date('2026-08-20T08:00:00.000Z'),
  };
}

function harness(options?: {
  posts?: ReturnType<typeof scheduledPost>[];
  postsAfterSync?: ReturnType<typeof scheduledPost>[];
}) {
  const posts = options?.posts ?? [scheduledPost()];
  const postsAfterSync = options?.postsAfterSync ?? posts;
  const findManyInputs: unknown[] = [];
  const updateInputs: Array<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [];
  const tx = {
    telegramManagedPost: {
      updateMany: jest
        .fn()
        .mockImplementation((input: (typeof updateInputs)[number]) => {
          updateInputs.push(input);
          return Promise.resolve({ count: typeof input.where.id === 'string' ? 1 : postsAfterSync.length });
        }),
    },
  };
  const prisma = {
    telegramChannel: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'channel-1',
        username: 'example',
        telegramChatId: '-100123',
        inviteLink: null,
        telegramAccessHash: 'hash',
      }),
    },
    telegramManagedPost: {
      count: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockImplementation((input: unknown) => {
        findManyInputs.push(input);
        return Promise.resolve(postsAfterSync);
      }),
    },
    telegramManagedPostSendOperation: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest
      .fn()
      .mockImplementation((callback: (client: typeof tx) => Promise<number>) =>
        callback(tx),
      ),
  };
  const mtproto = {
    getScheduledHistory: jest
      .fn()
      .mockResolvedValue([{ id: '101' }, { id: '102' }]),
    getScheduledMessagesByIds: jest
      .fn()
      .mockImplementation(({ messageIds }: { messageIds: string[] }) =>
        Promise.resolve(messageIds.map((id) => ({ id }))),
      ),
    getManagedPostMessages: jest.fn().mockResolvedValue({
      published: [],
      recentPublished: [],
      recentPublishedComplete: true,
      scheduled: [],
    }),
    deleteScheduledPost: jest.fn().mockResolvedValue(undefined),
  };
  const support = {
    workspace: jest.fn().mockResolvedValue('workspace-1'),
    invalidateTelegramChannelReadCache: jest.fn(),
  };
  const access = {
    connectedAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
    mtprotoChannelReference: jest.fn().mockReturnValue({
      username: 'example',
      telegramChatId: '-100123',
      inviteLink: null,
      telegramAccessHash: 'hash',
    }),
    accountCredentials: jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'api-hash',
      session: 'session',
    }),
    telegramMessageUrlsForPost: jest.fn().mockReturnValue([]),
  };
  const revisions = {
    createManagedPostRevisions: jest.fn().mockResolvedValue(undefined),
    createManagedPostRevision: jest.fn().mockResolvedValue(undefined),
  };
  const groups = {
    normalizePostGroupNumbering: jest.fn().mockResolvedValue(undefined),
  };
  const remoteSync = {
    syncManagedPosts: jest.fn().mockResolvedValue({ checked: posts.length }),
  };
  const publication = {
    publishManagedPost: jest.fn().mockResolvedValue({ id: 'rescheduled' }),
    returnManagedPostToDraft: jest.fn().mockResolvedValue({ id: 'draft' }),
  };
  const identity = {
    findPublishedIdentity: jest.fn().mockReturnValue(null),
    normalizedPlainText: (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim(),
  };
  const rescheduler = new TelegramManagedPostReschedulerService(
    prisma as never,
    mtproto as never,
    support as never,
    access as never,
    revisions as never,
    groups as never,
    publication as never,
    identity as never,
  );
  const service = new TelegramManagedPostScheduledResetService(
    prisma as never,
    mtproto as never,
    support as never,
    access as never,
    revisions as never,
    groups as never,
    remoteSync as never,
    rescheduler,
  );
  return {
    service,
    prisma,
    tx,
    mtproto,
    revisions,
    groups,
    remoteSync,
    publication,
    identity,
    updateInputs,
    findManyInputs,
  };
}

describe('TelegramManagedPostScheduledResetService', () => {
  it('reschedules future posts and returns overdue unpublished posts to drafts', async () => {
    const future = {
      ...scheduledPost('future'),
      scheduledAt: new Date(Date.now() + 60_000),
      origin: 'MANUAL',
    };
    const overdue = {
      ...scheduledPost('overdue'),
      telegramScheduledMessageIds: ['102'],
      scheduledAt: new Date(Date.now() - 60_000),
      origin: 'MANUAL',
    };
    const { service, publication, findManyInputs } = harness({
      posts: [future, overdue],
    });
    const progress: string[] = [];
    const progressCounts: Array<[number, number]> = [];
    publication.publishManagedPost.mockImplementationOnce(
      (...args: unknown[]) => {
        const report = args[7] as (stage: string) => void;
        report('REMOVING_OLD_SCHEDULE');
        report('SCHEDULING_AGAIN');
        return Promise.resolve({ id: 'rescheduled' });
      },
    );
    const result = await service.rescheduleChannelScheduledPosts(
      'user-1',
      'channel-1',
      (item, current, total) => {
        progress.push(`${item.postId ?? 'sync'}:${item.stage}`);
        progressCounts.push([current, total]);
      },
    );
    expect(publication.publishManagedPost).toHaveBeenCalledWith(
      'workspace-1',
      'channel-1',
      'future',
      future.scheduledAt,
      'IMAGES_THEN_TEXT',
      'user-1',
      true,
      expect.any(Function),
    );
    const rescheduleQuery = findManyInputs[0] as {
      where: Record<string, unknown>;
    };
    expect(rescheduleQuery.where).toMatchObject({
      postBatchDelivery: { is: null },
      adSalePlacements: { none: {} },
      mutualPromotionDelivery: { is: null },
    });
    expect(publication.returnManagedPostToDraft).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      rescheduledCount: 1,
      returnedToDraftCount: 1,
      failedCount: 0,
    });
    expect(progress).toEqual([
      'sync:LOADING_LOCAL_SCHEDULE',
      'sync:LOADING_TELEGRAM_SCHEDULE',
      'sync:LOADING_TELEGRAM_SCHEDULE',
      'sync:LOADING_TELEGRAM_SCHEDULE',
      'sync:RECONCILING_TELEGRAM',
      'sync:RECONCILING_TELEGRAM',
      'sync:RECONCILING_TELEGRAM',
      'future:RECONCILING_TELEGRAM',
      'future:REMOVING_OLD_SCHEDULE',
      'future:SCHEDULING_AGAIN',
      'future:RESCHEDULED',
      'overdue:RECONCILING_TELEGRAM',
      'overdue:RETURNING_TO_DRAFT',
      'overdue:DRAFTED',
    ]);
    expect(result.alreadyPublishedCount).toBe(0);
    expect(progressCounts).toContainEqual([0, 2]);
    expect(progressCounts).toContainEqual([1, 2]);
    expect(progressCounts).toContainEqual([2, 2]);
  });

  it('keeps an overdue post published when Telegram confirms a unique content identity', async () => {
    const overdue = {
      ...scheduledPost('overdue-published'),
      scheduledAt: new Date(Date.now() - 60_000),
      origin: 'MANUAL',
    };
    const { service, identity, mtproto, publication, updateInputs } = harness({
      posts: [overdue],
    });
    mtproto.getManagedPostMessages.mockResolvedValue({
      published: [
        { id: '101', date: new Date(Date.now() - 30_000).toISOString() },
      ],
      recentPublished: [],
      recentPublishedComplete: true,
      scheduled: [],
    });

    identity.findPublishedIdentity.mockReturnValue({ messageIds: ['501'], matchedMessage: { date: new Date().toISOString() } } as never);
    const result = await service.rescheduleChannelScheduledPosts(
      'user-1',
      'channel-1',
    );

    expect(result).toMatchObject({
      rescheduledCount: 0,
      returnedToDraftCount: 0,
      alreadyPublishedCount: 1,
      failedCount: 0,
    });
    expect(publication.returnManagedPostToDraft).not.toHaveBeenCalled();
    expect(updateInputs[0].data).toMatchObject({
      status: TelegramManagedPostStatus.PUBLISHED,
      telegramMessageIds: ['501'],
      telegramScheduledMessageIds: [],
    });
  });

  it('preserves future local-scheduler posts without sending them through Telegram native scheduling', async () => {
    const local = {
      ...scheduledPost('local-future'),
      scheduleMode: 'LOCAL',
      scheduledAt: new Date(Date.now() + 60_000),
    };
    const { service, publication, mtproto } = harness({ posts: [local] });
    const progress: string[] = [];

    const result = await service.rescheduleChannelScheduledPosts(
      'user-1',
      'channel-1',
      (item) => progress.push(item.stage),
    );

    expect(mtproto.getScheduledHistory).not.toHaveBeenCalled();
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
    expect(result.locallyScheduledCount).toBe(1);
    expect(progress).toContain('LOCAL_SCHEDULE_PRESERVED');
  });

  it('does not create a duplicate when a future post has no stored Telegram schedule IDs', async () => {
    const missingIds = {
      ...scheduledPost('missing-ids'),
      scheduledAt: new Date(Date.now() + 60_000),
      telegramScheduledMessageIds: [],
    };
    const { service, publication } = harness({ posts: [missingIds] });

    const result = await service.rescheduleChannelScheduledPosts(
      'user-1',
      'channel-1',
    );

    expect(publication.publishManagedPost).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failedCount: 1,
      failedPostIds: ['missing-ids'],
    });
  });

  it('reports failed posts and continues processing the rest', async () => {
    const future = {
      ...scheduledPost('future'),
      scheduledAt: new Date(Date.now() + 60_000),
      origin: 'MANUAL',
    };
    const { service, publication } = harness({ posts: [future] });
    publication.publishManagedPost.mockRejectedValueOnce(
      new Error('Telegram unavailable'),
    );
    const result = await service.rescheduleChannelScheduledPosts(
      'user-1',
      'channel-1',
    );
    expect(result).toMatchObject({
      rescheduledCount: 0,
      failedCount: 1,
      failedPostIds: ['future'],
    });
  });

  it('continues with other senders when one Telegram scheduled queue is unavailable', async () => {
    const unavailableSenderPost = {
      ...scheduledPost('unavailable-sender'),
      sourceId: 'account-a',
      scheduledAt: new Date(Date.now() + 60_000),
      telegramScheduledMessageIds: ['201'],
    };
    const availableSenderPost = {
      ...scheduledPost('available-sender'),
      sourceId: 'account-b',
      scheduledAt: new Date(Date.now() + 120_000),
      telegramScheduledMessageIds: ['101'],
    };
    const { service, mtproto, publication } = harness({
      posts: [unavailableSenderPost, availableSenderPost],
    });
    mtproto.getScheduledHistory.mockRejectedValueOnce(
      new Error('Sender session unavailable'),
    );

    const result = await service.rescheduleChannelScheduledPosts(
      'user-1',
      'channel-1',
    );

    expect(mtproto.getScheduledHistory).toHaveBeenCalledTimes(2);
    expect(publication.publishManagedPost).toHaveBeenCalledWith(
      'workspace-1',
      'channel-1',
      'available-sender',
      availableSenderPost.scheduledAt,
      'IMAGES_THEN_TEXT',
      'user-1',
      true,
      expect.any(Function),
    );
    expect(result).toMatchObject({
      rescheduledCount: 1,
      failedCount: 1,
      failedPostIds: ['unavailable-sender'],
    });
  });

  it('blocks concurrent recovery before any Telegram write', async () => {
    const { service, prisma, publication } = harness({ posts: [{ ...scheduledPost(), scheduledAt: new Date(Date.now() + 60_000) }] });
    prisma.telegramManagedPost.updateMany.mockResolvedValue({ count: 0 });
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.failedCount).toBe(1);
    expect(result.results?.[0].message).toContain('already being processed');
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it('does not draft an overdue post just because bounded history contains no match', async () => {
    const { service, mtproto, publication, updateInputs } = harness();
    mtproto.getScheduledHistory.mockResolvedValue([]);
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.failedCount).toBe(1);
    expect(result.results?.[0].message).toContain('not proven absent');
    expect(publication.returnManagedPostToDraft).not.toHaveBeenCalled();
    expect(updateInputs).toEqual([]);
  });

  it('keeps an uncertain native reschedule claimed so a repeat cannot blindly resend', async () => {
    const { service, prisma, publication } = harness({ posts: [{ ...scheduledPost(), scheduledAt: new Date(Date.now() + 60_000) }] });
    publication.publishManagedPost.mockRejectedValue(new Error('connection lost'));
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.results?.[0].message).toContain('outcome is uncertain');
    expect(prisma.telegramManagedPost.updateMany).toHaveBeenCalledTimes(1);
  });

  it('reports blocked original sender instead of treating another account queue as cancellation proof', async () => {
    const { service, mtproto, publication } = harness({ posts: [{ ...scheduledPost(), scheduledAt: new Date(Date.now() + 60_000) }] });
    mtproto.getScheduledHistory.mockRejectedValue(new Error('AUTH_KEY_UNREGISTERED'));
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.failedCount).toBe(1);
    expect(result.results?.[0].message).toContain('AUTH_KEY_UNREGISTERED');
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it('rechecks the native queue before restoring a subsequently missing future schedule', async () => {
    const { service, mtproto, publication } = harness({ posts: [{ ...scheduledPost(), scheduledAt: new Date(Date.now() + 60_000) }] });
    expect((await service.rescheduleChannelScheduledPosts('user-1', 'channel-1')).rescheduledCount).toBe(1);
    mtproto.getScheduledHistory.mockResolvedValue([]);
    expect((await service.rescheduleChannelScheduledPosts('user-1', 'channel-1')).rescheduledCount).toBe(1);
    expect(publication.publishManagedPost).toHaveBeenCalledTimes(2);
    expect(mtproto.getScheduledHistory).toHaveBeenCalledTimes(2);
  });

  it('restores a missing future native schedule after one full original queue read', async () => {
    const future = { ...scheduledPost(), scheduledAt: new Date(Date.now() + 120_000) };
    const { service, mtproto, publication, prisma } = harness({ posts: [future] });
    mtproto.getScheduledHistory.mockResolvedValue([]);
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result).toMatchObject({ rescheduledCount: 1, failedCount: 0 });
    expect(mtproto.getScheduledHistory).toHaveBeenCalledTimes(1);
    expect(mtproto.getScheduledMessagesByIds).not.toHaveBeenCalled();
    expect(mtproto.getManagedPostMessages).toHaveBeenCalledTimes(1);
    expect(prisma.telegramManagedPostSendOperation.count).toHaveBeenCalledWith({
      where: { postId: future.id, workspaceId: 'workspace-1', channelId: 'channel-1' },
    });
    expect(publication.publishManagedPost).toHaveBeenCalledTimes(1);
  });

  it('blocks an early Send Now publication regardless of its original future schedule', async () => {
    const future = { ...scheduledPost(), scheduledAt: new Date(Date.now() + 10 * 86_400_000) };
    const { service, mtproto, publication } = harness({ posts: [future] });
    mtproto.getScheduledHistory.mockResolvedValue([]);
    mtproto.getManagedPostMessages.mockResolvedValue({ published: [], scheduled: [],
      recentPublishedComplete: true,
      recentPublished: [{ id: '999', text: 'Body', hasMedia: false, date: new Date().toISOString() }],
    } as never);
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.results?.[0].message).toContain('already published');
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it('blocks a missing future schedule when published history hits its bounded cap', async () => {
    const future = { ...scheduledPost(), scheduledAt: new Date(Date.now() + 120_000) };
    const { service, mtproto, publication } = harness({ posts: [future] });
    mtproto.getScheduledHistory.mockResolvedValue([]);
    mtproto.getManagedPostMessages.mockResolvedValue({ published: [], scheduled: [], recentPublished: [], recentPublishedComplete: false } as never);
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.results?.[0].message).toContain('history is incomplete');
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it('rejects both candidates that reference the same sender queue ID', async () => {
    const future = { ...scheduledPost('first'), scheduledAt: new Date(Date.now() + 120_000) };
    const second = { ...future, id: 'second' };
    const { service, publication, prisma } = harness({ posts: [future, second] });
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.failedCount).toBe(2);
    expect(result.results?.every((item) => item.message?.includes('overlap'))).toBe(true);
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
    expect(prisma.telegramManagedPost.updateMany).not.toHaveBeenCalled();
  });

  it('does not use a default account queue to prove absence for a missing original sender', async () => {
    const future = { ...scheduledPost(), sourceId: null as unknown as string, scheduledAt: new Date(Date.now() + 120_000) };
    const { service, mtproto, publication } = harness({ posts: [future] });
    mtproto.getScheduledHistory.mockResolvedValue([]);
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.results?.[0].message).toContain('Original sender');
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it('blocks partial native schedules without replacing or cancelling their surviving parts', async () => {
    const future = { ...scheduledPost(), scheduledAt: new Date(Date.now() + 120_000), telegramScheduledMessageIds: ['101', '103'] };
    const { service, publication, mtproto } = harness({ posts: [future] });
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.results?.[0].message).toContain('Only part');
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
    expect(mtproto.deleteScheduledPost).not.toHaveBeenCalled();
  });

  it('blocks orphan matching scheduled content under new Telegram IDs', async () => {
    const future = { ...scheduledPost(), scheduledAt: new Date(Date.now() + 120_000) };
    const { service, mtproto, publication } = harness({ posts: [future] });
    mtproto.getScheduledHistory.mockResolvedValue([{ id: '999', text: ' Body ' }] as never);
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.results?.[0].message).toContain('matching unlinked');
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it.each(['journal', 'published-id', 'attempt'])('blocks missing schedule recovery with %s delivery evidence', async (evidence) => {
    const future = { ...scheduledPost(), scheduledAt: new Date(Date.now() + 120_000),
      ...(evidence === 'published-id' ? { telegramMessageIds: ['999'] } : {}),
      ...(evidence === 'attempt' ? { deliveryAttemptCount: 1 } : {}),
    };
    const { service, mtproto, publication, prisma } = harness({ posts: [future] });
    mtproto.getScheduledHistory.mockResolvedValue([]);
    if (evidence === 'journal') prisma.telegramManagedPostSendOperation.count.mockResolvedValue(1);
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result.results?.[0].message).toContain('delivery evidence');
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it('does not turn a future schedule into an immediate send when admission crosses its deadline', async () => {
    jest.useFakeTimers();
    try {
      const future = { ...scheduledPost(), scheduledAt: new Date(Date.now() + 1_000) };
      const { service, mtproto, publication, prisma } = harness({ posts: [future] });
      mtproto.getScheduledHistory.mockResolvedValue([]);
      prisma.telegramManagedPostSendOperation.count.mockImplementation(async () => {
        jest.setSystemTime(Date.now() + 2_000);
        return 0;
      });
      const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
      expect(result.results?.[0].message).toContain('deadline passed');
      expect(publication.publishManagedPost).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  it('keeps a failed recovery visible when its publisher changed the post to FAILED before retry', async () => {
    const future = { ...scheduledPost(), scheduledAt: new Date(Date.now() + 120_000) };
    const { service, prisma, publication } = harness({ posts: [future] });
    publication.publishManagedPost.mockImplementation(async () => {
      prisma.telegramManagedPost.findMany.mockResolvedValue([]);
      throw new Error('Telegram scheduling failed after native cancellation');
    });
    const initial = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1', undefined, [future.id]);
    expect(initial.failedPostIds).toEqual([future.id]);
    const retry = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1', undefined, initial.failedPostIds);
    expect(retry).toMatchObject({ failedCount: 1, failedPostIds: [future.id], rescheduledCount: 0 });
    expect(retry.results).toEqual([{ postId: future.id, stage: 'FAILED',
      message: 'Post is no longer eligible for scheduled recovery; refresh and recover its current status.' }]);
    expect(publication.publishManagedPost).toHaveBeenCalledTimes(1);
  });

  it('processes eligible requested IDs while reporting ineligible IDs once without exposing foreign post data', async () => {
    const future = { ...scheduledPost(), scheduledAt: new Date(Date.now() + 120_000) };
    const { service, publication, findManyInputs } = harness({ posts: [future] });
    const progress = jest.fn();
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1', progress,
      [future.id, 'not-in-this-workspace', future.id, 'not-in-this-workspace']);
    expect((findManyInputs[0] as { where: { id: unknown } }).where.id).toEqual({ in: [future.id, 'not-in-this-workspace'] });
    expect(result).toMatchObject({ rescheduledCount: 1, failedCount: 1, failedPostIds: ['not-in-this-workspace'] });
    expect(result.results?.find((item) => item.postId === 'not-in-this-workspace')).toEqual({
      postId: 'not-in-this-workspace', stage: 'FAILED',
      message: 'Post is no longer eligible for scheduled recovery; refresh and recover its current status.',
    });
    expect(publication.publishManagedPost).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ postId: future.id, stage: 'RESCHEDULED' }), 2, 2);
  });

  it('retains completed publication and draft outcomes when retrying a disconnected stream', async () => {
    const { service, prisma, publication } = harness({ posts: [] });
    prisma.telegramManagedPost.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'published', status: 'PUBLISHED', telegramMessageIds: ['900'], telegramIdVerificationStatus: 'VERIFIED' },
        { id: 'draft', status: 'DRAFT', telegramMessageIds: [], telegramIdVerificationStatus: 'UNKNOWN' },
      ]);
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1', undefined,
      ['published', 'draft', 'unknown']);
    expect(result).toMatchObject({ alreadyPublishedCount: 1, returnedToDraftCount: 1, failedCount: 1, failedPostIds: ['unknown'] });
    expect(result.results?.map(({ postId, stage }) => ({ postId, stage }))).toEqual([
      { postId: 'published', stage: 'ALREADY_PUBLISHED' },
      { postId: 'draft', stage: 'DRAFTED' },
      { postId: 'unknown', stage: 'FAILED' },
    ]);
    expect(prisma.telegramManagedPost.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: 'workspace-1', telegramChannelId: 'channel-1',
        postBatchDelivery: { is: null }, adSalePlacements: { none: {} }, mutualPromotionDelivery: { is: null } }),
      select: { id: true, status: true, telegramMessageIds: true, telegramIdVerificationStatus: true },
    }));
    expect(publication.publishManagedPost).not.toHaveBeenCalled();
  });

  it('keeps unverified published statuses actionable rather than claiming confirmed delivery', async () => {
    const { service, prisma } = harness({ posts: [] });
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'unverified', status: 'PUBLISHED', telegramMessageIds: [], telegramIdVerificationStatus: 'UNKNOWN' },
    ]);
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1', undefined, ['unverified']);
    expect(result).toMatchObject({ alreadyPublishedCount: 0, failedCount: 1, failedPostIds: ['unverified'] });
  });

  it('does not invent missing-ID errors for the default current scheduled plan', async () => {
    const { service } = harness({ posts: [] });
    const result = await service.rescheduleChannelScheduledPosts('user-1', 'channel-1');
    expect(result).toMatchObject({ failedCount: 0, failedPostIds: [], results: [] });
  });

  it('deletes every remote scheduled message and resets channel posts to clean drafts', async () => {
    const second = { ...scheduledPost('post-2'), groupId: null };
    const {
      service,
      prisma,
      tx,
      mtproto,
      revisions,
      groups,
      remoteSync,
      updateInputs,
    } = harness({ posts: [scheduledPost(), second] });

    const result = await service.resetChannelScheduledPosts(
      'user-1',
      'channel-1',
    );

    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'channel-1',
          workspaceId: 'workspace-1',
          isActive: true,
        },
      }),
    );
    expect(remoteSync.syncManagedPosts).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
    );
    expect(mtproto.deleteScheduledPost).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds: ['101', '102'] }),
    );
    expect(revisions.createManagedPostRevisions).toHaveBeenCalledWith(
      tx,
      expect.arrayContaining([
        expect.objectContaining({ id: 'post-1' }),
        expect.objectContaining({ id: 'post-2' }),
      ]),
      'before_channel_scheduled_reset',
      'user-1',
    );
    const updateInput = updateInputs[0];
    expect(updateInput.where).toEqual({
      id: { in: ['post-1', 'post-2'] },
      workspaceId: 'workspace-1',
      telegramChannelId: 'channel-1',
      status: TelegramManagedPostStatus.SCHEDULED,
    });
    expect(updateInput.data).toMatchObject({
      remoteImportKey: null,
      status: TelegramManagedPostStatus.DRAFT,
      scheduledAt: null,
      scheduleMode: null,
      telegramScheduledMessageIds: [],
      telegramMessageIds: [],
      telegramMessageUrls: [],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
      sourceType: null,
      sourceId: null,
      sourceWasPremium: null,
      publishMode: null,
      lastError: null,
    });
    expect(groups.normalizePostGroupNumbering).toHaveBeenCalledWith(
      tx,
      'group-1',
    );
    expect(result).toEqual({
      action: 'RESET_CHANNEL_SCHEDULED_TO_DRAFT',
      channelId: 'channel-1',
      remoteScheduledDeletedCount: 2,
      postsReturnedToDraftCount: 2,
      postIds: ['post-1', 'post-2'],
    });
  });

  it('reconciles Telegram first and preserves posts that became published', async () => {
    const stillScheduled = scheduledPost('post-2');
    const { service, prisma, revisions, updateInputs } = harness({
      posts: [scheduledPost(), stillScheduled],
      postsAfterSync: [stillScheduled],
    });

    const result = await service.resetChannelScheduledPosts(
      'user-1',
      'channel-1',
    );

    expect(prisma.telegramManagedPost.findMany).toHaveBeenCalledTimes(1);
    expect(revisions.createManagedPostRevisions).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: 'post-2' })],
      'before_channel_scheduled_reset',
      'user-1',
    );
    expect(updateInputs[0]?.where).toMatchObject({
      id: { in: ['post-2'] },
      status: TelegramManagedPostStatus.SCHEDULED,
    });
    expect(result.postIds).toEqual(['post-2']);
  });

  it('does not change local posts when Telegram cancellation fails', async () => {
    const { service, prisma, mtproto } = harness();
    mtproto.deleteScheduledPost.mockRejectedValue(
      new Error('AUTH_KEY_UNREGISTERED'),
    );

    await expect(
      service.resetChannelScheduledPosts('user-1', 'channel-1'),
    ).rejects.toThrow('AUTH_KEY_UNREGISTERED');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cleans local scheduled state even when Telegram has no queued messages', async () => {
    const { service, mtproto, tx } = harness();
    mtproto.getScheduledHistory.mockResolvedValue([]);

    const result = await service.resetChannelScheduledPosts(
      'user-1',
      'channel-1',
    );

    expect(mtproto.deleteScheduledPost).not.toHaveBeenCalled();
    expect(tx.telegramManagedPost.updateMany).toHaveBeenCalled();
    expect(result.remoteScheduledDeletedCount).toBe(0);
    expect(result.postsReturnedToDraftCount).toBe(1);
  });
});
