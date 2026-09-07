/* eslint-disable @typescript-eslint/no-unsafe-assignment -- focused Jest matcher assertions */
import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { TelegramBotApiError } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramManagedPostRemoteDeletionService } from './telegram-managed-post-remote-deletion.service';

describe('TelegramManagedPostRemoteDeletionService', () => {
  const prisma = {
    telegramManagedPost: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const sourceAccess = { sourcesForChannel: jest.fn() };
  const access = {
    botTokenForSource: jest.fn().mockResolvedValue('bot-token'),
    botChatId: jest.fn().mockReturnValue('-100123'),
    connectedAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
    accountCredentials: jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    }),
    mtprotoChannelReference: jest.fn().mockReturnValue({
      telegramChatId: '123',
    }),
  };
  const botApi = { call: jest.fn(), deleteMessage: jest.fn() };
  const mtproto = {
    deletePublishedMessages: jest.fn(),
    deleteScheduledPost: jest.fn(),
    getManagedPostMessages: jest.fn(),
  };
  const identity = { findPublishedIdentity: jest.fn() };
  const service = new TelegramManagedPostRemoteDeletionService(
    prisma as never,
    sourceAccess as never,
    access as never,
    botApi as never,
    mtproto as never,
    identity as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.telegramManagedPost.updateMany.mockResolvedValue({ count: 2 });
    botApi.call.mockResolvedValue(true);
    mtproto.deletePublishedMessages.mockResolvedValue(undefined);
    mtproto.deleteScheduledPost.mockResolvedValue(undefined);
    identity.findPublishedIdentity.mockReset();
  });

  it('batches posts through their original capable bot and retains their rows', async () => {
    prisma.telegramManagedPost.findMany.mockResolvedValue([
      post('post-1', ['11', '12']),
      post('post-2', ['13']),
    ]);
    sourceAccess.sourcesForChannel.mockResolvedValue([
      source('bot-1', TelegramSourceType.BOT),
    ]);

    const result = await service.deletePublishedManagedPosts({
      workspaceId: 'workspace-1',
      managedPostIds: ['post-1', 'post-2'],
    });

    expect(botApi.call).toHaveBeenCalledTimes(1);
    expect(botApi.call).toHaveBeenCalledWith('bot-token', 'deleteMessages', {
      chat_id: '-100123',
      message_ids: [11, 12, 13],
    });
    expect(prisma.telegramManagedPost.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['post-1', 'post-2'] },
        workspaceId: 'workspace-1',
      },
      data: expect.objectContaining({
        status: TelegramManagedPostStatus.PUBLISHED,
        telegramRemoteStatus: TelegramManagedPostRemoteStatus.AUTO_DELETED,
      }),
    });
    expect(result).toMatchObject({
      considered: 2,
      deleted: 2,
      skipped: 0,
      failed: 0,
    });
  });

  it('falls back to a capable MTProto source when bot deletion fails', async () => {
    prisma.telegramManagedPost.findMany.mockResolvedValue([
      post('post-1', ['11']),
    ]);
    sourceAccess.sourcesForChannel.mockResolvedValue([
      source('bot-1', TelegramSourceType.BOT),
      source('account-1', TelegramSourceType.MTPROTO),
    ]);
    botApi.call.mockRejectedValue(new Error('Bot API unavailable'));
    botApi.deleteMessage.mockRejectedValue(new Error('Bot API unavailable'));

    const result = await service.deletePublishedManagedPosts({
      workspaceId: 'workspace-1',
      managedPostIds: ['post-1'],
    });

    expect(mtproto.deletePublishedMessages).toHaveBeenCalledWith({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
      channel: { telegramChatId: '123' },
      messageIds: ['11'],
    });
    expect(result.failed).toBe(0);
  });

  it('treats already-absent Telegram messages as a successful deletion', async () => {
    prisma.telegramManagedPost.findMany.mockResolvedValue([
      post('post-1', ['11']),
    ]);
    sourceAccess.sourcesForChannel.mockResolvedValue([
      source('bot-1', TelegramSourceType.BOT),
    ]);
    botApi.call.mockRejectedValue(
      new TelegramBotApiError(
        'Bad Request: message to delete not found',
        'PERMANENT',
      ),
    );

    const result = await service.deletePublishedManagedPosts({
      workspaceId: 'workspace-1',
      managedPostIds: ['post-1'],
    });

    expect(botApi.deleteMessage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ deleted: 1, failed: 0 });
  });

  it('deletes at most five channels concurrently', async () => {
    prisma.telegramManagedPost.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) =>
        post(`post-${index + 1}`, [`${index + 11}`], `channel-${index + 1}`),
      ),
    );
    sourceAccess.sourcesForChannel.mockResolvedValue([
      source('bot-1', TelegramSourceType.BOT),
    ]);
    let active = 0;
    let maxActive = 0;
    let release!: () => void;
    let firstBatchStarted!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstBatchStarted = resolve;
    });
    botApi.call.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (active === 5) firstBatchStarted();
      await gate;
      active -= 1;
      return true;
    });

    const deletion = service.deletePublishedManagedPosts({
      workspaceId: 'workspace-1',
      managedPostIds: Array.from(
        { length: 6 },
        (_, index) => `post-${index + 1}`,
      ),
    });
    await started;

    expect(botApi.call).toHaveBeenCalledTimes(5);
    expect(maxActive).toBe(5);
    release();

    const result = await deletion;
    expect(botApi.call).toHaveBeenCalledTimes(6);
    expect(maxActive).toBe(5);
    expect(result).toMatchObject({ deleted: 6, failed: 0 });
  });

  it('cancels a mutual-promotion post that is still in Telegram Scheduled Messages', async () => {
    prisma.telegramManagedPost.findMany.mockResolvedValue([
      nativeScheduledPost('native-1'),
    ]);
    sourceAccess.sourcesForChannel.mockResolvedValue([
      source('account-1', TelegramSourceType.MTPROTO),
    ]);
    mtproto.getManagedPostMessages.mockResolvedValue({
      published: [],
      recentPublished: [],
      scheduled: [{ id: '301', date: '2026-09-08T12:00:00.000Z' }],
    });

    const result = await service.deletePublishedManagedPosts({
      workspaceId: 'workspace-1',
      managedPostIds: ['native-1'],
    });

    expect(mtproto.deleteScheduledPost).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds: ['301'] }),
    );
    expect(mtproto.deletePublishedMessages).not.toHaveBeenCalled();
    expect(result).toMatchObject({ deleted: 1, failed: 0 });
  });

  it('resolves a natively scheduled post after Telegram publishes it and then deletes it', async () => {
    prisma.telegramManagedPost.findMany.mockResolvedValue([
      nativeScheduledPost('native-1'),
    ]);
    sourceAccess.sourcesForChannel.mockResolvedValue([
      source('account-1', TelegramSourceType.MTPROTO),
    ]);
    mtproto.getManagedPostMessages.mockResolvedValue({
      published: [],
      recentPublished: [
        {
          id: '401',
          text: 'Body',
          date: '2026-09-08T12:00:00.000Z',
          hasMedia: false,
          groupedId: null,
        },
      ],
      scheduled: [],
    });
    identity.findPublishedIdentity.mockReturnValue({ messageIds: ['401'] });

    const result = await service.deletePublishedManagedPosts({
      workspaceId: 'workspace-1',
      managedPostIds: ['native-1'],
    });

    expect(prisma.telegramManagedPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'native-1' },
        data: expect.objectContaining({ telegramMessageIds: ['401'] }),
      }),
    );
    expect(mtproto.deletePublishedMessages).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds: ['401'] }),
    );
    expect(result).toMatchObject({ deleted: 1, failed: 0 });
  });
});

function source(sourceId: string, sourceType: TelegramSourceType) {
  return {
    sourceId,
    sourceType,
    permissions: { canDeleteMessages: true },
  };
}

function post(
  id: string,
  telegramMessageIds: string[],
  telegramChannelId = 'channel-1',
) {
  return {
    id,
    text: 'Body',
    imageUrls: [],
    scheduledAt: new Date('2026-09-08T12:00:00.000Z'),
    scheduleMode: null,
    publishMode: 'TEXT_ONLY',
    status: TelegramManagedPostStatus.PUBLISHED,
    telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
    telegramScheduledMessageIds: [],
    telegramMessageIds,
    sourceId: 'bot-1',
    sourceType: TelegramSourceType.BOT,
    telegramChannelId,
    telegramChannel: {
      username: 'channel',
      telegramChatId: '123',
      inviteLink: null,
      telegramAccessHash: null,
    },
  };
}

function nativeScheduledPost(id: string) {
  return {
    ...post(id, []),
    status: TelegramManagedPostStatus.SCHEDULED,
    telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
    scheduleMode: 'TELEGRAM_NATIVE',
    telegramScheduledMessageIds: ['301'],
    sourceId: 'account-1',
    sourceType: TelegramSourceType.MTPROTO,
  };
}
