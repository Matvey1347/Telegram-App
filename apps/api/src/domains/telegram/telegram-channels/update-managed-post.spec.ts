import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { TelegramChannelsService } from './telegram-channels.service';
import {
  createTelegramChannelsTestHarness,
  type TelegramChannelsTestHarness,
} from './__fixtures__/telegram-channels.test-harness';
import { TelegramManagedPostEditTransportService } from './telegram-managed-post-edit-transport.service';

describe('TelegramChannelsService updateManagedPost', () => {
  it('edits a bot-owned advertising post through its bot even when MTProto is also available', async () => {
    const botCall = jest.fn().mockResolvedValue({ ok: true });
    const editReplyMarkup = jest.fn().mockResolvedValue({ ok: true });
    const service = new TelegramManagedPostEditTransportService(
      { editPostText: jest.fn() } as never,
      {
        sourcesForChannel: jest.fn().mockResolvedValue([
          {
            sourceId: 'account-1',
            sourceType: TelegramSourceType.MTPROTO,
            permissions: { canEditMessages: true, canPostMessages: true },
          },
          {
            sourceId: 'bot-1',
            sourceType: TelegramSourceType.BOT,
            permissions: { canEditMessages: false, canPostMessages: true },
          },
        ]),
      } as never,
      { call: botCall, editMessageReplyMarkup: editReplyMarkup } as never,
      {
        mtprotoChannelReference: jest.fn().mockReturnValue({
          telegramChatId: '-100123',
          username: 'example',
        }),
        botTokenForSource: jest.fn().mockResolvedValue('token'),
        botChatId: jest.fn().mockReturnValue('@example'),
      } as never,
      {
        telegramTextEditNote: jest.fn(),
        isBotMessageNotModified: jest.fn().mockReturnValue(false),
      } as never,
      {
        resolveInternalPostLinksForPublish: jest
          .fn()
          .mockImplementation(async (_workspace, _post, text) => text),
        renderManagedPostText: jest.fn().mockReturnValue({
          richHtml: null,
          publishMode: 'TEXT_ONLY',
          captionHtml: '',
          followupHtmlParts: [],
          textHtmlParts: ['Updated text'],
        }),
        toBotMessageEntity: jest.fn(),
      } as never,
    );

    await service.editManagedPostTextInTelegram({
      workspaceId: 'workspace',
      channelId: 'channel',
      post: {
        id: 'post-bot',
        status: TelegramManagedPostStatus.PUBLISHED,
        text: 'Old text',
        imageUrls: [],
        publishMode: 'TEXT_ONLY',
        sourceId: 'bot-1',
        sourceType: TelegramSourceType.BOT,
        scheduledAt: null,
        telegramScheduledMessageIds: [],
        telegramMessageIds: ['42'],
        telegramMessageUrls: [],
        buttonRows: [],
      },
      channel: {
        id: 'channel',
        workspaceId: 'workspace',
        username: 'example',
        telegramChatId: '-100123',
      },
      nextText: 'Updated text',
      buttonRows: [[{ text: 'Open', url: 'https://example.com' }]],
      inPlaceOnly: true,
    });

    expect(botCall).toHaveBeenCalledWith(
      'token',
      'editMessageText',
      expect.objectContaining({ message_id: 42 }),
    );
    expect(editReplyMarkup).toHaveBeenCalled();
  });

  it('passes the original schedule time when editing an MTProto scheduled message', async () => {
    const scheduleAt = new Date('2026-09-06T15:15:00Z');
    const editPostText = jest.fn().mockResolvedValue({
      updatedCount: 1,
      unchangedCount: 0,
    });
    const service = new TelegramManagedPostEditTransportService(
      { editPostText } as never,
      {
        sourcesForChannel: jest.fn().mockResolvedValue([
          {
            sourceId: 'account-1',
            sourceType: TelegramSourceType.MTPROTO,
            permissions: { canEditMessages: true, canPostMessages: true },
          },
        ]),
      } as never,
      {} as never,
      {
        mtprotoChannelReference: jest.fn().mockReturnValue({
          telegramChatId: '-100123',
          username: 'example',
        }),
        connectedAccount: jest.fn().mockResolvedValue({ id: 'account-1' }),
        accountCredentials: jest.fn().mockReturnValue({
          apiId: '1',
          apiHash: 'hash',
          session: 'session',
        }),
      } as never,
      { telegramTextEditNote: jest.fn().mockReturnValue('Updated.') } as never,
      {
        resolveInternalPostLinksForPublish: jest
          .fn()
          .mockResolvedValue('Updated text'),
        renderManagedPostText: jest.fn().mockReturnValue({
          richHtml: null,
          publishMode: 'TEXT_ONLY',
          captionHtml: '',
          followupHtmlParts: [],
          textHtmlParts: ['Updated text'],
        }),
      } as never,
    );

    await service.editManagedPostTextInTelegram({
      workspaceId: 'workspace',
      channelId: 'channel',
      post: {
        id: 'post-scheduled',
        status: TelegramManagedPostStatus.SCHEDULED,
        text: 'Old text',
        imageUrls: [],
        publishMode: 'TEXT_ONLY',
        sourceId: 'account-1',
        sourceType: TelegramSourceType.MTPROTO,
        scheduledAt: scheduleAt,
        telegramScheduledMessageIds: ['153'],
        telegramMessageIds: [],
        telegramMessageUrls: [],
        buttonRows: [],
      },
      channel: {
        id: 'channel',
        workspaceId: 'workspace',
        username: 'example',
        telegramChatId: '-100123',
      },
      nextText: 'Updated text',
      buttonRows: [],
    });

    expect(editPostText).toHaveBeenCalledWith(
      expect.objectContaining({
        messageIds: ['153'],
        scheduleAt,
      }),
    );
  });

  it('updates an existing scheduled Telegram message instead of recreating it', async () => {
    const post = {
      id: 'post-scheduled',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      title: 'Campaign',
      text: 'Old text',
      imageUrls: [],
      buttonRows: [],
      status: TelegramManagedPostStatus.SCHEDULED,
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
      scheduledAt: new Date('2026-08-28T10:00:00Z'),
      publishedAt: null,
      telegramScheduledMessageIds: ['91'],
      telegramMessageIds: [],
      telegramMessageUrls: [],
      sourceId: 'mtproto-1',
      sourceType: TelegramSourceType.MTPROTO,
      publishMode: 'TEXT_ONLY',
      assignedMemberId: 'member-1',
      icon: null,
      groupId: null,
      groupPosition: null,
      statusPosition: null,
      sidebarPosition: null,
    };
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue(post),
        update: jest.fn().mockResolvedValue({ ...post, text: 'New text' }),
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel',
          workspaceId: 'workspace',
          telegramChatId: '-100123',
          username: 'example',
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(prisma)),
    };
    const service = createTelegramChannelsTestHarness(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const editManagedPostTextInTelegram = jest.fn().mockResolvedValue({
      telegramScheduledMessageIds: ['91'],
      lastTelegramSyncNote: 'Scheduled Telegram message updated.',
    });
    service['editManagedPostTextInTelegram'] = editManagedPostTextInTelegram;
    service['createManagedPostRevision'] = jest
      .fn()
      .mockResolvedValue(undefined);
    service['attachManagedPostIcons'] = jest
      .fn()
      .mockImplementation(async (posts) => posts);

    await service.updateManagedPost('user', 'channel', post.id, {
      title: 'Campaign',
      text: 'New text',
    });

    expect(editManagedPostTextInTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        post: expect.objectContaining({
          id: post.id,
          telegramScheduledMessageIds: ['91'],
        }),
        nextText: 'New text',
      }),
    );
    expect(editManagedPostTextInTelegram).toHaveBeenCalledWith(
      expect.objectContaining({
        post: expect.objectContaining({ scheduledAt: post.scheduledAt }),
      }),
    );
    expect(prisma.telegramManagedPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: post.id } }),
    );
  });

  it('allows a member to edit text when the submitted assignee is unchanged', async () => {
    const post = {
      id: 'post-1',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      title: 'Pinned',
      text: 'Old text',
      imageUrls: [],
      status: TelegramManagedPostStatus.PUBLISHED,
      scheduledAt: null,
      publishedAt: new Date('2026-07-10T10:00:00Z'),
      telegramMessageIds: [],
      telegramMessageUrls: ['https://t.me/c/3976683330/34'],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
      sourceId: null,
      sourceType: null,
      publishMode: 'TEXT_ONLY',
      lastError: 'Telegram post link is broken.',
      lastTelegramSyncedAt: null,
      lastTelegramSyncNote: null,
      assignedMemberId: 'member-1',
      icon: null,
      groupId: null,
      groupPosition: null,
      statusPosition: null,
      sidebarPosition: null,
      updatedAt: new Date('2026-07-18T10:00:00Z'),
      createdAt: new Date('2026-07-10T10:00:00Z'),
    };

    const update = jest.fn().mockResolvedValue({});
    const createRevision = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue(post),
        update,
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel',
          workspaceId: 'workspace',
          username: 'example',
          telegramChatId: '-1003976683330',
          inviteLink: null,
        }),
      },
      telegramManagedPostRevision: {
        create: createRevision,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'member-olga' }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ exists: '"TelegramManagedPostRevision"' }]),
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(prisma)),
    };
    const mtprotoClient = {
      editPostText: jest.fn().mockResolvedValue({
        updatedCount: 1,
        unchangedCount: 0,
      }),
    };
    const sourceAccessService = {
      sourcesForChannel: jest.fn().mockResolvedValue([
        {
          sourceId: 'mtproto-1',
          sourceType: TelegramSourceType.MTPROTO,
          permissions: { canEditMessages: true },
        },
      ]),
    };
    const resolveAssignedMemberId = jest
      .fn()
      .mockRejectedValue(
        new Error('Workspace members can only assign entities to themselves'),
      );
    const service = createTelegramChannelsTestHarness(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
        resolveAssignedMemberId,
      } as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      mtprotoClient as never,
      sourceAccessService as never,
      {} as never,
    );
    service['connectedAccount'] = jest.fn().mockResolvedValue({
      id: 'mtproto-1',
    });
    service['accountCredentials'] = jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });
    service['resolveInternalPostLinksForPublish'] = jest
      .fn()
      .mockResolvedValue('Updated text');
    service['renderManagedPostText'] = jest.fn().mockReturnValue({
      html: 'Updated text',
      captionHtml: 'Updated text',
      followupHtmlParts: [],
      textHtmlParts: ['Updated text'],
      publishMode: 'TEXT_ONLY',
    });

    await service.updateManagedPost('user', 'channel', 'post-1', {
      title: 'Pinned',
      text: 'Updated text',
      assignedMemberId: 'member-1',
    });

    expect(mtprotoClient.editPostText).toHaveBeenCalledWith(
      expect.objectContaining({
        messageIds: ['34'],
      }),
    );
    expect(resolveAssignedMemberId).not.toHaveBeenCalled();
    expect(createRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorMemberId: 'member-olga' }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceId: 'mtproto-1',
          sourceType: TelegramSourceType.MTPROTO,
          telegramMessageIds: ['34'],
        }),
      }),
    );
  });

  it('treats Telegram MESSAGE_NOT_MODIFIED as a successful no-op update', async () => {
    const post = {
      id: 'post-2',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      title: 'Tech post',
      text: 'Old text',
      imageUrls: ['https://example.com/image.png'],
      status: TelegramManagedPostStatus.PUBLISHED,
      scheduledAt: null,
      publishedAt: new Date('2026-07-10T10:00:00Z'),
      telegramMessageIds: ['41', '42'],
      telegramMessageUrls: ['https://t.me/c/3976683330/41'],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.PUBLISHED,
      sourceId: 'mtproto-1',
      sourceType: TelegramSourceType.MTPROTO,
      publishMode: 'IMAGES_THEN_TEXT',
      lastError: null,
      lastTelegramSyncedAt: null,
      lastTelegramSyncNote: null,
      assignedMemberId: 'member-1',
      icon: null,
      groupId: null,
      groupPosition: null,
      sidebarPosition: null,
      updatedAt: new Date('2026-07-18T10:00:00Z'),
      createdAt: new Date('2026-07-10T10:00:00Z'),
    };

    const update = jest.fn().mockResolvedValue({});
    const createRevision = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue(post),
        update,
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel',
          workspaceId: 'workspace',
          username: 'example',
          telegramChatId: '-1003976683330',
          inviteLink: null,
        }),
      },
      telegramManagedPostRevision: {
        create: createRevision,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ exists: '"TelegramManagedPostRevision"' }]),
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(prisma)),
    };
    const mtprotoClient = {
      editPostText: jest.fn().mockResolvedValue({
        updatedCount: 0,
        unchangedCount: 2,
      }),
    };
    const sourceAccessService = {
      sourcesForChannel: jest.fn().mockResolvedValue([
        {
          sourceId: 'mtproto-1',
          sourceType: TelegramSourceType.MTPROTO,
          permissions: { canEditMessages: true },
        },
      ]),
    };
    const service = createTelegramChannelsTestHarness(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
        resolveAssignedMemberId: jest.fn().mockResolvedValue({
          assignedMemberId: 'member-1',
        }),
      } as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      mtprotoClient as never,
      sourceAccessService as never,
      {} as never,
    );
    service['connectedAccount'] = jest.fn().mockResolvedValue({
      id: 'mtproto-1',
    });
    service['accountCredentials'] = jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });
    service['createManagedPostRevision'] = createRevision;
    service['resolveInternalPostLinksForPublish'] = jest
      .fn()
      .mockResolvedValue('Unchanged rendered text');
    service['renderManagedPostText'] = jest.fn().mockReturnValue({
      html: 'Unchanged rendered text',
      captionHtml: 'Same caption',
      followupHtmlParts: ['Same followup'],
      textHtmlParts: [],
      publishMode: 'IMAGES_THEN_TEXT',
    });

    await expect(
      service.updateManagedPost('user', 'channel', 'post-2', {
        title: 'Tech post',
        text: 'Unchanged rendered text',
        assignedMemberId: 'member-1',
      }),
    ).resolves.toBeDefined();

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastTelegramSyncNote: 'Telegram text already matched the live post.',
        }),
      }),
    );
  });

  it('removes a manual Telegram link and returns the post to draft', async () => {
    const currentPost = {
      id: 'post-3',
      workspaceId: 'workspace',
      telegramChannelId: 'channel',
      title: 'Broken post',
      text: 'Body',
      imageUrls: ['https://example.com/image.png'],
      status: TelegramManagedPostStatus.PUBLISHED,
      scheduledAt: null,
      publishedAt: new Date('2026-07-10T10:00:00Z'),
      telegramMessageIds: ['55'],
      telegramMessageUrls: ['https://t.me/c/3976683330/55'],
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.BROKEN,
      sourceId: 'mtproto-1',
      sourceType: TelegramSourceType.MTPROTO,
      publishMode: 'IMAGES_THEN_TEXT',
      lastError: 'Telegram post link is broken.',
      lastTelegramSyncedAt: null,
      lastTelegramSyncNote: null,
      assignedMemberId: 'member-1',
      icon: null,
      groupId: null,
      groupPosition: null,
      sidebarPosition: null,
      updatedAt: new Date('2026-07-18T10:00:00Z'),
      createdAt: new Date('2026-07-10T10:00:00Z'),
    };

    const update = jest.fn().mockResolvedValue({
      ...currentPost,
      status: TelegramManagedPostStatus.DRAFT,
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
      telegramMessageIds: [],
      telegramMessageUrls: [],
      sourceId: null,
      sourceType: null,
      publishMode: null,
      publishedAt: null,
      scheduledAt: null,
      lastError: null,
      lastTelegramSyncNote:
        'Telegram link was removed manually. Post returned to draft.',
    });
    const createRevision = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramManagedPost: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'post-3' })
          .mockResolvedValueOnce({
            id: 'channel',
            workspaceId: 'workspace',
            username: 'example',
            telegramChatId: '-1003976683330',
            inviteLink: null,
          })
          .mockResolvedValueOnce(currentPost),
        findUnique: jest.fn().mockResolvedValue({
          ...currentPost,
          status: TelegramManagedPostStatus.DRAFT,
          statusPosition: null,
        }),
        update,
      },
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'channel',
          workspaceId: 'workspace',
          username: 'example',
          telegramChatId: '-1003976683330',
          inviteLink: null,
        }),
      },
      telegramManagedPostRevision: {
        create: createRevision,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ exists: '"TelegramManagedPostRevision"' }]),
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(prisma)),
    };
    const service = createTelegramChannelsTestHarness(
      prisma as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
      } as never,
      { clearByPrefix: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    service['createManagedPostRevision'] = createRevision;

    await service.setManagedPostTelegramUrl('user', 'channel', 'post-3', '');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TelegramManagedPostStatus.DRAFT,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
          telegramMessageIds: [],
          telegramMessageUrls: [],
          sourceId: null,
          sourceType: null,
          publishMode: null,
          publishedAt: null,
        }),
      }),
    );
  });

  it('rejects a manual Telegram URL while the post is still scheduled', async () => {
    const update = jest.fn();
    const service = createTelegramChannelsTestHarness(
      {
        telegramManagedPost: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({ id: 'post-3' })
            .mockResolvedValueOnce({
              id: 'post-3',
              status: TelegramManagedPostStatus.SCHEDULED,
            }),
          update,
        },
        telegramChannel: {
          findFirst: jest.fn().mockResolvedValue({ id: 'channel' }),
        },
      } as never,
      {
        resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.setManagedPostTelegramUrl(
        'user',
        'channel',
        'post-3',
        'https://t.me/c/3976683330/34',
      ),
    ).rejects.toThrow('Cancel or publish the scheduled Telegram post');
    expect(update).not.toHaveBeenCalled();
  });

  it('replaces an existing MTProto post with a native rich Bot API message', async () => {
    const deletePublishedMessages = jest.fn().mockResolvedValue(undefined);
    const botCall = jest.fn().mockResolvedValue({ message_id: 99 });
    const botApiClient = {
      call: botCall,
      deleteMessage: jest.fn(),
      getMe: jest.fn().mockResolvedValue({ id: 777 }),
      getChatMember: jest.fn().mockResolvedValue({
        status: 'administrator',
        can_post_messages: true,
        can_edit_messages: true,
        can_delete_messages: true,
      }),
    };
    const mtprotoSource = {
      sourceId: 'account-1',
      sourceType: TelegramSourceType.MTPROTO,
      permissions: { canEditMessages: true, canPostMessages: true },
    };
    const botSource = {
      sourceId: 'system-bot',
      sourceType: TelegramSourceType.BOT,
      permissions: { canEditMessages: true, canPostMessages: true },
    };
    const sourcesForChannel = jest
      .fn()
      .mockResolvedValueOnce([mtprotoSource])
      .mockResolvedValueOnce([mtprotoSource, botSource]);
    const upsertAccess = jest.fn().mockResolvedValue(undefined);
    const service = createTelegramChannelsTestHarness(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { deletePublishedMessages } as never,
      {
        sourcesForChannel,
        normalizeBotPermissions: jest.fn().mockReturnValue({
          role: 'ADMIN',
          permissions: botSource.permissions,
        }),
        upsertAccess,
      } as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      botApiClient as never,
      { token: 'bot-token' } as never,
    );
    service['resolveInternalPostLinksForPublish'] = jest
      .fn()
      .mockImplementation(async (_workspace, _post, text) => text);
    service['connectedAccount'] = jest.fn().mockResolvedValue({
      id: 'account-1',
    });
    service['accountCredentials'] = jest.fn().mockReturnValue({
      apiId: '1',
      apiHash: 'hash',
      session: 'session',
    });
    service['botTokenForSource'] = jest.fn().mockResolvedValue('bot-token');

    const result = await service['editManagedPostTextInTelegram']({
      workspaceId: 'workspace',
      channelId: 'channel',
      post: {
        id: 'post-1',
        status: TelegramManagedPostStatus.PUBLISHED,
        text: 'Old text',
        imageUrls: ['https://cdn.example.com/post.jpg?size=large&fit=cover'],
        publishMode: 'IMAGE_WITH_CAPTION',
        sourceId: 'account-1',
        sourceType: TelegramSourceType.MTPROTO,
        scheduledAt: null,
        telegramScheduledMessageIds: [],
        telegramMessageIds: ['41'],
        telegramMessageUrls: ['https://t.me/example/41'],
        buttonRows: [],
      },
      channel: {
        id: 'channel',
        workspaceId: 'workspace',
        username: 'example',
        telegramChatId: '-100123',
      },
      nextText:
        '# Quote\n\n:::table header\n| Header 1 | Header 2 |\n| Cell 1 | Cell 2 |\n:::',
      buttonRows: [],
    });

    expect(botCall).toHaveBeenCalledWith('bot-token', 'sendRichMessage', {
      chat_id: '-100123',
      rich_message: {
        html: '<img src="https://cdn.example.com/post.jpg?size=large&amp;fit=cover"/>\n<h1>Quote</h1>\n\n<table bordered><tr><th>Header 1</th><th>Header 2</th></tr><tr><td>Cell 1</td><td>Cell 2</td></tr></table>',
      },
    });
    expect(deletePublishedMessages).toHaveBeenCalledWith(
      expect.objectContaining({ messageIds: ['41'] }),
    );
    expect(botApiClient.getChatMember).toHaveBeenCalledWith(
      'bot-token',
      '-100123',
      '777',
    );
    expect(upsertAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel',
        sourceId: 'system-bot',
        sourceType: TelegramSourceType.BOT,
      }),
    );
    expect(result).toMatchObject({
      sourceId: 'system-bot',
      sourceType: TelegramSourceType.BOT,
      telegramMessageIds: ['99'],
      telegramMessageUrls: ['https://t.me/c/123/99'],
    });
  });
});
