import { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';

describe('TelegramManagedPostIdentityService', () => {
  const service = new TelegramManagedPostIdentityService();
  const scheduledAt = new Date('2026-08-09T08:15:00.000Z');

  it('ignores a published id collision and finds the actual published identity by content', () => {
    expect(
      service.findPublishedIdentity(
        {
          text: 'A real post',
          imageCount: 0,
          publishMode: null,
          scheduledAt,
        },
        [
          {
            id: '2806',
            text: 'Completely different old post',
            date: '2026-08-09T07:00:00.000Z',
            hasMedia: false,
            groupedId: null,
          },
          {
            id: '4427',
            text: 'A real post',
            date: '2026-08-09T08:15:02.000Z',
            hasMedia: false,
            groupedId: null,
          },
        ],
      ),
    ).toMatchObject({ messageIds: ['4427'] });
  });

  it('does not verify ambiguous exact matches', () => {
    const messages = ['4427', '4430'].map((id) => ({
      id,
      text: 'A real post',
      date: '2026-08-09T08:15:02.000Z',
      hasMedia: false,
      groupedId: null,
    }));
    expect(
      service.findPublishedIdentity(
        { text: 'A real post', imageCount: 0, publishMode: null, scheduledAt },
        messages,
      ),
    ).toBeNull();
  });

  it('keeps the album primary id semantics', () => {
    expect(service.primaryMessageId(['40', '41', '42'], 2)).toBe('41');
    expect(service.primaryMessageId(['42'], 0)).toBe('42');
  });

  it.each([
    {
      name: 'album caption',
      post: {
        text: 'Album caption',
        imageCount: 2,
        publishMode: 'CAPTION_THEN_TEXT',
        scheduledAt,
      },
      messages: [
        {
          id: '40',
          text: 'Album caption',
          date: '2026-08-09T08:15:01.000Z',
          hasMedia: true,
          groupedId: 'album-1',
        },
        {
          id: '41',
          text: '',
          date: '2026-08-09T08:15:01.000Z',
          hasMedia: true,
          groupedId: 'album-1',
        },
      ],
      ids: ['40', '41'],
    },
    {
      name: 'images then follow-up text',
      post: {
        text: 'Long follow-up',
        imageCount: 2,
        publishMode: 'IMAGES_THEN_TEXT',
        scheduledAt,
      },
      messages: [
        {
          id: '50',
          text: '',
          date: '2026-08-09T08:15:01.000Z',
          hasMedia: true,
          groupedId: 'album-2',
        },
        {
          id: '51',
          text: '',
          date: '2026-08-09T08:15:01.000Z',
          hasMedia: true,
          groupedId: 'album-2',
        },
        {
          id: '52',
          text: 'Long follow-up',
          date: '2026-08-09T08:15:02.000Z',
          hasMedia: false,
          groupedId: null,
        },
      ],
      ids: ['50', '51', '52'],
    },
    {
      name: 'caption then text continuation',
      post: {
        text: 'First part Second part',
        imageCount: 1,
        publishMode: 'CAPTION_THEN_TEXT',
        scheduledAt,
      },
      messages: [
        {
          id: '60',
          text: 'First part',
          date: '2026-08-09T08:15:01.000Z',
          hasMedia: true,
          groupedId: null,
        },
        {
          id: '61',
          text: 'Second part',
          date: '2026-08-09T08:15:02.000Z',
          hasMedia: false,
          groupedId: null,
        },
      ],
      ids: ['60', '61'],
    },
  ])(
    'matches $name with media and multipart structure',
    ({ post, messages, ids }) => {
      expect(service.findPublishedIdentity(post, messages)).toMatchObject({
        messageIds: ids,
      });
    },
  );

  it('promotes a scheduled post only with its verified actual published id', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'post-a',
            workspaceId: 'workspace',
            telegramChannelId: 'channel',
            status: 'SCHEDULED',
            text: 'A real post',
            imageUrls: [],
            publishMode: null,
            scheduledAt,
            publishedAt: null,
            telegramScheduledMessageIds: ['2806'],
            telegramMessageIds: [],
            telegramLinkSource: 'AUTO',
            telegramChannel: { telegramChatId: '-1001590085922' },
          },
        ]),
        update,
      },
    };
    const identity = new TelegramManagedPostIdentityService(prisma as never);
    await identity.reconcile({
      workspaceId: 'workspace',
      loadRemote: jest.fn().mockResolvedValue({
        published: [
          {
            id: '2806',
            text: 'Completely different old post',
            date: '2026-08-09T07:00:00.000Z',
            hasMedia: false,
            groupedId: null,
          },
        ],
        recentPublished: [
          {
            id: '2806',
            text: 'Completely different old post',
            date: '2026-08-09T07:00:00.000Z',
            hasMedia: false,
            groupedId: null,
          },
          {
            id: '4427',
            text: 'A real post',
            date: '2026-08-09T08:15:02.000Z',
            hasMedia: false,
            groupedId: null,
          },
        ],
      }),
      repairDependants: jest.fn().mockResolvedValue(undefined),
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'post-a' },
      data: expect.objectContaining({
        status: 'PUBLISHED',
        telegramScheduledMessageIds: [],
        telegramMessageIds: ['4427'],
        telegramMessageUrls: ['https://t.me/c/1590085922/4427'],
        telegramIdVerificationStatus: 'VERIFIED',
      }),
    });
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('title');
    expect(data).not.toHaveProperty('text');
    expect(data).not.toHaveProperty('imageUrls');
  });

  it('marks a manual mismatch without overwriting the manual id or url', async () => {
    const update = jest.fn().mockResolvedValue({});
    const post = {
      id: 'post-a',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      status: 'PUBLISHED',
      text: 'A real post',
      imageUrls: [],
      publishMode: null,
      scheduledAt: null,
      publishedAt: scheduledAt,
      telegramScheduledMessageIds: [],
      telegramMessageIds: ['4427'],
      telegramMessageUrls: ['https://t.me/c/1590085922/4427'],
      telegramLinkSource: 'MANUAL',
      telegramChannel: { telegramChatId: '-1001590085922' },
    };
    const identity = new TelegramManagedPostIdentityService({
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([post]),
        update,
      },
    } as never);
    await identity.reconcile({
      workspaceId: 'workspace',
      explicit: true,
      loadRemote: jest.fn().mockResolvedValue({
        published: [],
        recentPublished: [
          {
            id: '4430',
            text: 'A real post',
            date: '2026-08-09T08:15:02.000Z',
            hasMedia: false,
            groupedId: null,
          },
        ],
      }),
      repairDependants: jest.fn(),
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'post-a' },
      data: {
        telegramIdVerificationStatus: 'MISMATCH',
        telegramIdVerifiedAt: null,
        telegramIdLastCheckedAt: expect.any(Date),
      },
    });
  });

  it('does not overwrite identity after a concurrent manual correction', async () => {
    const update = jest.fn();
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const identity = new TelegramManagedPostIdentityService({
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'post-a',
            workspaceId: 'workspace',
            telegramChannelId: 'channel',
            status: 'PUBLISHED',
            text: 'A real post',
            imageUrls: [],
            publishMode: null,
            scheduledAt: null,
            publishedAt: scheduledAt,
            telegramScheduledMessageIds: [],
            telegramMessageIds: ['old-id'],
            telegramMessageUrls: ['https://t.me/c/1590085922/old-id'],
            telegramLinkSource: 'AUTO',
            telegramChannel: { telegramChatId: '-1001590085922' },
          },
        ]),
        updateMany,
        update,
      },
    } as never);

    const result = await identity.reconcile({
      workspaceId: 'workspace',
      explicit: true,
      loadRemote: jest.fn().mockResolvedValue({
        published: [],
        recentPublished: [
          {
            id: '4427',
            text: 'A real post',
            date: '2026-08-09T08:15:02.000Z',
            hasMedia: false,
            groupedId: null,
          },
        ],
      }),
      repairDependants: jest.fn(),
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'post-a',
          telegramLinkSource: 'AUTO',
          telegramMessageIds: { equals: ['old-id'] },
        }),
      }),
    );
    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ checked: 1, verified: 0, skipped: 1 });
  });

  it('does not promote a due post from the local clock when Telegram has not confirmed it', async () => {
    const update = jest.fn().mockResolvedValue({});
    const due = new Date(Date.now() - 1_000);
    const identity = new TelegramManagedPostIdentityService({
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'post-a',
            workspaceId: 'workspace',
            telegramChannelId: 'channel',
            status: 'SCHEDULED',
            text: 'A real post',
            imageUrls: [],
            publishMode: null,
            scheduledAt: due,
            publishedAt: null,
            telegramScheduledMessageIds: ['2806'],
            telegramMessageIds: [],
            telegramLinkSource: 'AUTO',
            telegramChannel: { telegramChatId: '-1001590085922' },
          },
        ]),
        update,
      },
    } as never);
    await identity.reconcile({
      workspaceId: 'workspace',
      loadRemote: jest.fn().mockResolvedValue({
        published: [],
        recentPublished: [],
      }),
      repairDependants: jest.fn(),
    });
    expect(update.mock.calls[0][0].data).toEqual({
      telegramIdLastCheckedAt: expect.any(Date),
    });
  });

  it('keeps verified published identity retryable when dependent repair fails', async () => {
    const published = {
      id: 'post-a',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      status: 'PUBLISHED',
      text: 'A real post',
      imageUrls: [],
      publishMode: null,
      scheduledAt: null,
      publishedAt: scheduledAt,
      telegramScheduledMessageIds: [],
      telegramMessageIds: ['4427'],
      telegramLinkSource: 'AUTO',
      telegramIdVerificationStatus: 'UNVERIFIED',
      telegramIdLastCheckedAt: null,
      lastTelegramSyncNote:
        'Published Telegram identity verified; dependent scheduled-link repair pending.',
      telegramChannel: { telegramChatId: '-1001590085922' },
    };
    const update = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([published]);
    const identity = new TelegramManagedPostIdentityService({
      telegramManagedPost: { findMany, update },
    } as never);
    const remote = {
      published: [
        {
          id: '4427',
          text: 'A real post',
          date: '2026-08-09T08:15:02.000Z',
          hasMedia: false,
          groupedId: null,
        },
      ],
      recentPublished: [
        {
          id: '4427',
          text: 'A real post',
          date: '2026-08-09T08:15:02.000Z',
          hasMedia: false,
          groupedId: null,
        },
      ],
    };
    const repair = jest
      .fn()
      .mockRejectedValueOnce(new Error('Telegram reschedule failed'))
      .mockResolvedValueOnce(undefined);

    const first = await identity.reconcile({
      workspaceId: 'workspace',
      loadRemote: jest.fn().mockResolvedValue(remote),
      repairDependants: repair,
    });
    expect(first).toMatchObject({ verified: 0, skipped: 1 });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'post-a' },
      data: {
        telegramIdVerificationStatus: 'UNVERIFIED',
        telegramIdVerifiedAt: null,
        telegramIdLastCheckedAt: expect.any(Date),
        lastTelegramSyncNote:
          'Published Telegram identity verified; dependent scheduled-link repair pending.',
      },
    });

    const second = await identity.reconcile({
      workspaceId: 'workspace',
      loadRemote: jest.fn().mockResolvedValue(remote),
      repairDependants: repair,
    });
    expect(second.verified).toBe(1);
    expect(repair).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'PUBLISHED',
          lastTelegramSyncNote:
            'Published Telegram identity verified; dependent scheduled-link repair pending.',
        }),
      ]),
    );
  });
});
