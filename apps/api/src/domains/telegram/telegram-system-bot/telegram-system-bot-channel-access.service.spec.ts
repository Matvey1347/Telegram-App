/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- focused Prisma and Telegram adapter doubles */
import { TelegramChannelSourceRole } from '@prisma/client';
import { TelegramSystemBotChannelAccessService } from './telegram-system-bot-channel-access.service';

describe('TelegramSystemBotChannelAccessService', () => {
  const permissions = {
    canPostMessages: true,
    canEditMessages: true,
    canDeleteMessages: false,
    canInviteUsers: false,
    canManageInviteLinks: false,
    canViewStats: false,
  };

  function harness() {
    const prisma = {
      telegramChannel: {
        findMany: jest.fn(),
        findFirstOrThrow: jest.fn(),
      },
      telegramSystemBotConnection: { findMany: jest.fn() },
    } as any;
    const api = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      sendPhoto: jest.fn().mockResolvedValue({ message_id: 2 }),
      getMe: jest.fn(),
      getChatMember: jest.fn(),
    } as any;
    const config = {
      environment: 'LOCAL',
      token: 'local-token',
      auditCredentials: jest.fn().mockReturnValue([
        {
          environment: 'LOCAL',
          token: 'local-token',
          username: 'local_bot',
          selected: true,
        },
        {
          environment: 'PRODUCTION',
          token: 'production-token',
          username: 'production_bot',
          selected: false,
        },
      ]),
    } as any;
    const sourceAccess = {
      normalizeBotPermissions: jest.fn((raw) => ({
        role:
          raw.status === 'administrator'
            ? TelegramChannelSourceRole.ADMIN
            : TelegramChannelSourceRole.MEMBER,
        permissions,
      })),
      upsertAccess: jest.fn().mockResolvedValue(undefined),
    } as any;
    return {
      service: new TelegramSystemBotChannelAccessService(
        prisma,
        api,
        config,
        sourceAccess,
      ),
      prisma,
      api,
      config,
      sourceAccess,
    };
  }

  it('lists only compact own-channel actions for the workspace', async () => {
    const { service, prisma, api } = harness();
    prisma.telegramChannel.findMany.mockResolvedValue([
      {
        id: 'channel-1',
        title: 'News',
        username: 'news',
        photoUrl: null,
        isActive: true,
        currentSubscribersCount: 123,
      },
      {
        id: 'channel-2',
        title: 'Media',
        username: 'media',
        photoUrl: null,
        isActive: true,
        currentSubscribersCount: 456,
      },
    ]);

    await service.list('44', 'workspace-1');

    expect(prisma.telegramChannel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          archivedAt: null,
          adminLinks: { some: {} },
        },
      }),
    );
    expect(
      api.sendMessage.mock.calls[0][1].reply_markup.inline_keyboard,
    ).toEqual([
      [
        expect.objectContaining({ callback_data: 'channel:view:channel-1' }),
        expect.objectContaining({ callback_data: 'channel:view:channel-2' }),
      ],
    ]);
  });

  it('audits local and production bots but persists only selected environment access', async () => {
    const { service, prisma, api, sourceAccess } = harness();
    prisma.telegramChannel.findFirstOrThrow.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'workspace-1',
      title: 'News',
      username: 'news',
      telegramChatId: '-1001',
      photoUrl: null,
      isActive: true,
      currentSubscribersCount: null,
    });
    api.getMe
      .mockResolvedValueOnce({ id: 1, username: 'local_bot' })
      .mockResolvedValueOnce({ id: 2, username: 'production_bot' });
    api.getChatMember.mockResolvedValue({
      status: 'administrator',
      can_post_messages: true,
      can_edit_messages: true,
    });

    await service.auditAndSend('44', 'workspace-1', 'channel-1');

    expect(api.getChatMember).toHaveBeenCalledTimes(2);
    expect(sourceAccess.upsertAccess).toHaveBeenCalledTimes(1);
    expect(sourceAccess.upsertAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        channelId: 'channel-1',
        sourceId: 'system-bot',
      }),
    );
  });

  it('scopes channel details to the requested workspace and sends the real avatar as a photo', async () => {
    const { service, prisma, api } = harness();
    prisma.telegramChannel.findFirstOrThrow.mockResolvedValue({
      id: 'channel-1',
      workspaceId: 'workspace-1',
      title: 'News',
      username: 'news',
      telegramChatId: '-1001',
      accessMode: 'PUBLIC',
      photoUrl: 'https://cdn.example/news.jpg',
      isActive: true,
      currentSubscribersCount: 123,
      lastPublicSyncedAt: new Date('2026-08-24T12:00:00Z'),
    });

    await service.detail('44', 'workspace-1', 'channel-1', 'Europe/Warsaw');

    expect(prisma.telegramChannel.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'channel-1',
          workspaceId: 'workspace-1',
        }),
      }),
    );
    expect(api.sendPhoto).toHaveBeenCalledWith(
      'local-token',
      expect.objectContaining({
        photo: 'https://cdn.example/news.jpg',
        caption: expect.stringContaining('Access: PUBLIC'),
      }),
    );
  });

  it('persists newly granted admin access and notifies enabled workspace connections', async () => {
    const { service, prisma, api, sourceAccess } = harness();
    api.getMe.mockResolvedValue({ id: 7, username: 'local_bot' });
    prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1', workspaceId: 'workspace-1', title: 'News' },
    ]);
    prisma.telegramSystemBotConnection.findMany.mockResolvedValue([
      { telegramChatId: '44' },
    ]);

    await service.handleMyChatMember({
      chat: { id: -1001, type: 'channel', title: 'News' },
      old_chat_member: { status: 'member', user: { id: 7 } },
      new_chat_member: {
        status: 'administrator',
        user: { id: 7 },
        can_post_messages: true,
        can_edit_messages: true,
      },
    });

    expect(sourceAccess.upsertAccess).toHaveBeenCalledTimes(1);
    expect(prisma.telegramSystemBotConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          user: { memberships: { some: { workspaceId: 'workspace-1' } } },
        }),
      }),
    );
    expect(api.sendMessage).toHaveBeenCalledWith(
      'local-token',
      expect.objectContaining({ chat_id: '44' }),
    );
  });

  it('stores production membership updates under the production source only', async () => {
    const { service, prisma, api, config, sourceAccess } = harness();
    config.environment = 'PRODUCTION';
    config.token = 'production-token';
    api.getMe.mockResolvedValue({ id: 8, username: 'production_bot' });
    prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1', workspaceId: 'workspace-1', title: 'News' },
    ]);
    prisma.telegramSystemBotConnection.findMany.mockResolvedValue([]);

    await service.handleMyChatMember({
      chat: { id: -1001, type: 'channel', title: 'News' },
      old_chat_member: { status: 'member', user: { id: 8 } },
      new_chat_member: {
        status: 'administrator',
        user: { id: 8 },
        can_post_messages: true,
      },
    });

    expect(sourceAccess.upsertAccess).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'system-bot-production' }),
    );
    expect(sourceAccess.upsertAccess).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'system-bot' }),
    );
  });

  it('does not notify when the bot was already an administrator', async () => {
    const { service, prisma, api } = harness();
    api.getMe.mockResolvedValue({ id: 7 });
    prisma.telegramChannel.findMany.mockResolvedValue([
      { id: 'channel-1', workspaceId: 'workspace-1', title: 'News' },
    ]);

    await service.handleMyChatMember({
      chat: { id: -1001, type: 'channel' },
      old_chat_member: { status: 'administrator', user: { id: 7 } },
      new_chat_member: { status: 'administrator', user: { id: 7 } },
    });

    expect(prisma.telegramSystemBotConnection.findMany).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});
