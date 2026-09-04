import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { TelegramManagedPostScheduledResetService } from './telegram-managed-post-scheduled-reset.service';

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
          return Promise.resolve({ count: postsAfterSync.length });
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
      findMany: jest.fn().mockResolvedValue(postsAfterSync),
    },
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
    deleteScheduledPost: jest.fn().mockResolvedValue(undefined),
  };
  const support = { workspace: jest.fn().mockResolvedValue('workspace-1') };
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
  };
  const revisions = {
    createManagedPostRevisions: jest.fn().mockResolvedValue(undefined),
  };
  const groups = {
    normalizePostGroupNumbering: jest.fn().mockResolvedValue(undefined),
  };
  const remoteSync = {
    syncManagedPosts: jest.fn().mockResolvedValue({ checked: posts.length }),
  };
  const service = new TelegramManagedPostScheduledResetService(
    prisma as never,
    mtproto as never,
    support as never,
    access as never,
    revisions as never,
    groups as never,
    remoteSync as never,
  );
  return {
    service,
    prisma,
    tx,
    mtproto,
    revisions,
    groups,
    remoteSync,
    updateInputs,
  };
}

describe('TelegramManagedPostScheduledResetService', () => {
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
