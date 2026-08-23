import { TelegramPostMediaBackfillService } from './telegram-post-media-backfill.service';

describe('TelegramPostMediaBackfillService', () => {
  it('migrates only legacy Base64 slots, preserves HTTP URLs, and is idempotent', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'managed-1',
            imageUrls: [
              'https://cdn.test/existing.jpg',
              `data:image/jpeg;base64,${Buffer.from('legacy').toString('base64')}`,
            ],
          },
        ])
        .mockResolvedValue([]),
      telegramManagedPost: { update: jest.fn().mockResolvedValue({}) },
      telegramPost: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const storage = {
      persistImmutableImages: jest.fn().mockResolvedValue({
        urls: ['https://cdn.test/legacy.jpg'],
        uploaded: 1,
        reused: 0,
      }),
    };
    const service = new TelegramPostMediaBackfillService(
      prisma as never,
      storage as never,
      {} as never,
      {} as never,
    );

    const first = await service.run({ limit: 10 });
    const second = await service.run({ limit: 10 });

    expect(prisma.telegramManagedPost.update).toHaveBeenCalledWith({
      where: { id: 'managed-1' },
      data: {
        imageUrls: [
          'https://cdn.test/existing.jpg',
          'https://cdn.test/legacy.jpg',
        ],
      },
    });
    expect(storage.persistImmutableImages).toHaveBeenCalledTimes(1);
    expect(first.base64Migrated).toBe(1);
    expect(second.base64Migrated).toBe(0);
  });

  it('downloads synchronized photos per channel in one bounded batch and skips unsupported media', async () => {
    const rows = [
      {
        id: 'photo-post',
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '11',
        mediaKind: 'MessageMediaPhoto',
        telegramChannel: {
          id: 'channel-1',
          username: 'channel',
          telegramChatId: null,
          inviteLink: null,
          telegramAccessHash: null,
        },
      },
      {
        id: 'video-post',
        workspaceId: 'workspace-1',
        telegramChannelId: 'channel-1',
        telegramMessageId: '12',
        mediaKind: 'MessageMediaDocument',
        telegramChannel: {
          id: 'channel-1',
          username: 'channel',
          telegramChatId: null,
          inviteLink: null,
          telegramAccessHash: null,
        },
      },
    ];
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      telegramManagedPost: { update: jest.fn() },
      telegramPost: {
        findMany: jest.fn().mockResolvedValueOnce(rows).mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const storage = {
      persistImmutableImages: jest.fn().mockResolvedValue({
        urls: ['https://cdn.test/photo.jpg'],
        uploaded: 0,
        reused: 1,
      }),
    };
    const mtproto = {
      downloadChannelMessagesMedia: jest.fn().mockResolvedValue([
        {
          messageId: '11',
          buffer: Buffer.from('photo'),
          mimeType: 'image/jpeg',
        },
      ]),
    };
    const service = new TelegramPostMediaBackfillService(
      prisma as never,
      storage as never,
      mtproto as never,
      {} as never,
    );
    jest
      .spyOn(service as any, 'accountCredentialsForChannel')
      .mockResolvedValue({ apiId: '1', apiHash: 'hash', session: 'session' });

    const result = await service.run({ limit: 10 });

    expect(mtproto.downloadChannelMessagesMedia).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds: ['11'] }),
    );
    expect(prisma.telegramPost.update).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        telegramDownloaded: 1,
        unsupportedMedia: 1,
        b2Reused: 1,
      }),
    );
  });

  it('applies the explicit limit across both backfill phases', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([
        {
          id: 'managed-1',
          imageUrls: [
            `data:image/png;base64,${Buffer.from('legacy').toString('base64')}`,
          ],
        },
      ]),
      telegramManagedPost: { update: jest.fn().mockResolvedValue({}) },
      telegramPost: { findMany: jest.fn() },
    };
    const service = new TelegramPostMediaBackfillService(
      prisma as never,
      {
        persistImmutableImages: jest.fn().mockResolvedValue({
          urls: ['https://cdn.test/legacy.png'],
          uploaded: 1,
          reused: 0,
        }),
      } as never,
      {} as never,
      {} as never,
    );

    const result = await service.run({ limit: 1 });

    expect(result.considered).toBe(1);
    expect(prisma.telegramPost.findMany).not.toHaveBeenCalled();
  });
});
