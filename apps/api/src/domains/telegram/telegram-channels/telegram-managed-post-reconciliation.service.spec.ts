import { TelegramManagedPostReconciliationService } from './telegram-managed-post-reconciliation.service';

describe('TelegramManagedPostReconciliationService local delivery', () => {
  it('continues after one due post fails and reports the observable result', async () => {
    const duePosts = [
      { id: 'broken', workspaceId: 'workspace', telegramChannelId: 'channel' },
      { id: 'healthy', workspaceId: 'workspace', telegramChannelId: 'channel' },
    ];
    const prisma = {
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue(duePosts),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const publication = {
      publishManagedPost: jest
        .fn()
        .mockRejectedValueOnce(new Error('bot unavailable'))
        .mockResolvedValueOnce({ status: 'PUBLISHED' }),
    };
    const service = new TelegramManagedPostReconciliationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      publication as never,
    );

    await expect(
      service.publishDueLocallyScheduledManagedPosts(),
    ).resolves.toEqual({ considered: 2, published: 1, failed: 1 });
    expect(publication.publishManagedPost).toHaveBeenCalledTimes(2);
  });
});

describe('TelegramManagedPostReconciliationService remote identity window', () => {
  it('loads published history from the earliest scheduled post and checks scheduled ids as published ids', async () => {
    const scheduledAt = new Date('2026-09-14T19:15:00.000Z');
    let loadedRecent: Array<{ id: string }> = [];
    const identity = {
      reconcile: jest.fn().mockImplementation(async (params) => {
        const loaded = await params.loadRemote('channel-1', [
          {
            status: 'SCHEDULED',
            origin: 'TELEGRAM',
            scheduledAt,
            telegramMessageIds: [],
            telegramScheduledMessageIds: ['4290'],
            telegramChannel: {},
          },
        ]);
        loadedRecent = loaded.recentPublished;
        return { checked: 1, verified: 1, missing: 0 };
      }),
    };
    const mtproto = {
      getManagedPostMessages: jest.fn().mockResolvedValue({
        published: [],
        recentPublished: [],
        scheduled: [],
      }),
    };
    const access = {
      connectedAccount: jest.fn().mockResolvedValue({}),
      accountCredentials: jest.fn().mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      }),
      mtprotoChannelReference: jest.fn().mockReturnValue({}),
    };
    const service = new TelegramManagedPostReconciliationService(
      {
        telegramPost: {
          findMany: jest.fn().mockResolvedValue([
            {
              telegramMessageId: '8503',
              text: 'Published post',
              formattedText: 'Published post',
              postDate: scheduledAt,
              hasMedia: true,
              rawMessage: null,
            },
          ]),
        },
      } as never,
      mtproto as never,
      identity as never,
      {} as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.reconcileManagedPostIdentities({
      workspaceId: 'workspace-1',
    });

    expect(mtproto.getManagedPostMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedMessageIds: ['4290'],
        scheduledMessageIds: ['4290'],
        recentPublishedFrom: new Date('2026-09-13T19:15:00.000Z'),
        recentPublishedUntil: new Date('2026-09-15T19:15:00.000Z'),
      }),
    );
    expect(loadedRecent).toEqual([
      expect.objectContaining({ id: '8503', text: 'Published post' }),
    ]);
  });
});
