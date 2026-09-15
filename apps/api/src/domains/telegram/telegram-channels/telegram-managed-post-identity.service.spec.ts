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

  it('does not treat a surrounding empty service message as a second publication', () => {
    expect(
      service.findPublishedIdentity(
        {
          text: 'A real post',
          imageCount: 1,
          publishMode: 'IMAGE_WITH_CAPTION',
          scheduledAt,
        },
        [
          {
            id: '4427',
            text: 'A real post',
            date: '2026-08-09T08:15:02.000Z',
            hasMedia: true,
            groupedId: null,
          },
          {
            id: '4428',
            text: '',
            date: '2026-08-09T08:15:02.000Z',
            hasMedia: false,
            groupedId: null,
          },
        ],
      ),
    ).toMatchObject({ messageIds: ['4427'] });
  });

  it('matches a text-only post when Telegram exposes its link preview as media', () => {
    expect(
      service.findPublishedIdentity(
        {
          text: '[Read the full guide](https://example.com/guide)',
          imageCount: 0,
          publishMode: 'TEXT_ONLY',
          scheduledAt,
        },
        [
          {
            id: '4427',
            text: 'Read the full guide',
            date: '2026-08-09T08:15:02.000Z',
            hasMedia: true,
            groupedId: null,
          },
        ],
      ),
    ).toMatchObject({ messageIds: ['4427'] });
  });

  it('matches an imported Telegram post published later on the same day', () => {
    expect(
      service.findPublishedIdentity(
        {
          text: 'Delayed imported post',
          imageCount: 1,
          publishMode: null,
          scheduledAt,
          origin: 'TELEGRAM',
        },
        [
          {
            id: '10633',
            text: 'Delayed imported post',
            date: new Date(
              scheduledAt.getTime() + 7 * 60 * 60_000,
            ).toISOString(),
            hasMedia: true,
            groupedId: null,
          },
        ],
      ),
    ).toMatchObject({ messageIds: ['10633'] });
  });

  it('keeps the narrower match window for system-created posts', () => {
    expect(
      service.findPublishedIdentity(
        {
          text: 'Delayed system post',
          imageCount: 0,
          publishMode: null,
          scheduledAt,
          origin: 'SYSTEM',
        },
        [
          {
            id: '10633',
            text: 'Delayed system post',
            date: new Date(
              scheduledAt.getTime() + 7 * 60 * 60_000,
            ).toISOString(),
            hasMedia: false,
            groupedId: null,
          },
        ],
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

  it('verifies a Bot API rich message by its journaled id when GramJS has no rich text', async () => {
    const update = jest.fn().mockResolvedValue({});
    const richMessage = {
      id: '10',
      text: '',
      date: '2026-09-04T00:31:00.000Z',
      hasMedia: true,
      groupedId: null,
    };
    const prisma = {
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rich-post',
            workspaceId: 'workspace',
            telegramChannelId: 'channel',
            status: 'PUBLISHED',
            text: '# Heading',
            imageUrls: ['https://cdn.example.com/post.jpg'],
            publishMode: 'RICH_MESSAGE',
            scheduledAt: null,
            publishedAt: new Date('2026-09-04T00:31:00.000Z'),
            telegramScheduledMessageIds: [],
            telegramMessageIds: ['10'],
            telegramMessageUrls: ['https://t.me/c/3988203250/10'],
            telegramIdVerificationStatus: 'UNVERIFIED',
            telegramLinkSource: 'AUTO',
            telegramChannel: { telegramChatId: '3988203250' },
          },
        ]),
        update,
      },
    };
    const identity = new TelegramManagedPostIdentityService(prisma as never);

    await identity.reconcile({
      workspaceId: 'workspace',
      postId: 'rich-post',
      explicit: true,
      loadRemote: jest.fn().mockResolvedValue({
        published: [richMessage],
        recentPublished: [richMessage],
      }),
      repairDependants: jest.fn().mockResolvedValue(undefined),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'rich-post' },
      data: expect.objectContaining({
        telegramIdVerificationStatus: 'VERIFIED',
        telegramMessageIds: ['10'],
      }),
    });
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

  it('rechecks a missing scheduled post and promotes it after Telegram publishes it', async () => {
    const due = new Date(Date.now() - 20 * 60_000);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const identity = new TelegramManagedPostIdentityService({
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'post-missing',
            workspaceId: 'workspace',
            telegramChannelId: 'channel',
            status: 'SCHEDULED',
            text: 'Published after the first check',
            imageUrls: [],
            mediaItems: [],
            publishMode: null,
            scheduledAt: due,
            publishedAt: null,
            telegramScheduledMessageIds: ['scheduled-1'],
            telegramMessageIds: [],
            telegramMessageUrls: [],
            telegramLinkSource: 'AUTO',
            telegramIdVerificationStatus: 'MISSING',
            telegramIdLastCheckedAt: new Date(Date.now() - 31 * 60_000),
            telegramChannel: { telegramChatId: '-1001590085922' },
          },
        ]),
        updateMany,
      },
    } as never);

    const result = await identity.reconcile({
      workspaceId: 'workspace',
      loadRemote: jest.fn().mockResolvedValue({
        published: [],
        recentPublished: [
          {
            id: '4427',
            text: 'Published after the first check',
            date: due.toISOString(),
            hasMedia: false,
            groupedId: null,
          },
        ],
      }),
      repairDependants: jest.fn().mockResolvedValue(undefined),
    });

    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'post-missing',
          telegramIdVerificationStatus: 'MISSING',
        }),
      }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PUBLISHED',
          telegramIdVerificationStatus: 'VERIFIED',
          telegramMessageIds: ['4427'],
        }),
      }),
    );
    expect(result).toMatchObject({ checked: 1, verified: 1, missing: 0 });
  });

  it('removes an imported scheduled post after a second confirmed missing check', async () => {
    const due = new Date(Date.now() - 2 * 60 * 60_000);
    const claim = jest.fn().mockResolvedValue({ count: 1 });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const remainingGroupPosts = jest.fn().mockResolvedValue([
      {
        id: 'remaining-post',
        groupId: 'imported-group',
        status: 'PUBLISHED',
      },
    ]);
    const executeRaw = jest.fn().mockResolvedValue(0);
    const prisma = {
      telegramManagedPost: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'imported-missing',
            workspaceId: 'workspace',
            telegramChannelId: 'channel',
            origin: 'TELEGRAM',
            remoteImportKey: 'message:1147',
            status: 'SCHEDULED',
            text: 'Deleted in Telegram',
            imageUrls: [],
            mediaItems: [],
            publishMode: null,
            scheduledAt: due,
            publishedAt: null,
            groupId: 'imported-group',
            telegramScheduledMessageIds: ['1147'],
            telegramMessageIds: [],
            telegramMessageUrls: [],
            telegramLinkSource: 'AUTO',
            telegramIdVerificationStatus: 'MISSING',
            telegramIdLastCheckedAt: new Date(Date.now() - 31 * 60_000),
            telegramChannel: { telegramChatId: '-1001590085922' },
          },
        ]),
        updateMany: claim,
      },
      $transaction: jest.fn().mockImplementation(async (callback) =>
        callback({
          telegramManagedPost: {
            deleteMany,
            findMany: remainingGroupPosts,
          },
          $executeRaw: executeRaw,
        }),
      ),
    };
    const identity = new TelegramManagedPostIdentityService(prisma as never);

    const result = await identity.reconcile({
      workspaceId: 'workspace',
      loadRemote: jest.fn().mockResolvedValue({
        published: [],
        recentPublished: [],
      }),
      repairDependants: jest.fn(),
    });

    expect(deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'imported-missing',
        workspaceId: 'workspace',
        telegramChannelId: 'channel',
        origin: 'TELEGRAM',
        remoteImportKey: 'message:1147',
        status: 'SCHEDULED',
        telegramIdVerificationStatus: 'MISSING',
      }),
    });
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ checked: 1, missing: 1, skipped: 0 });
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
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).toContain(
      '"status":"PUBLISHED","lastTelegramSyncNote":"Published Telegram identity verified; dependent scheduled-link repair pending."',
    );
  });
});
