import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramBotApiError } from '../../../telegram/shared/telegram-bot-api.client';

describe('TelegramChannelAccessService production bot access', () => {
  function setup() {
    const prisma = {
      telegramChannel: { findFirst: jest.fn() },
    };
    const sourceAccess = {
      emptyPermissions: jest.fn().mockReturnValue({
        canPostMessages: false,
        canEditMessages: false,
        canDeleteMessages: false,
        canInviteUsers: false,
        canManageInviteLinks: false,
        canViewStats: false,
      }),
      normalizeBotPermissions: jest.fn().mockReturnValue({
        role: 'ADMIN',
        permissions: {
          canPostMessages: true,
          canEditMessages: true,
          canDeleteMessages: true,
          canInviteUsers: false,
          canManageInviteLinks: false,
          canViewStats: false,
        },
      }),
      upsertAccess: jest.fn().mockResolvedValue(undefined),
    };
    const botApi = {
      getMe: jest.fn().mockResolvedValue({ id: 42, username: 'nexeloq_bot' }),
      getChatMember: jest.fn().mockResolvedValue({
        status: 'administrator',
        can_post_messages: true,
      }),
    };
    const support = {
      workspace: jest.fn().mockResolvedValue('workspace-1'),
      normalizeUsername: jest.fn(
        (value?: string | null) => value?.replace(/^@/, '') || null,
      ),
      normalizeChatId: jest.fn(
        (value?: string | null) => value?.replace(/^-100/, '') || null,
      ),
    };
    const config = {
      productionToken: 'production-token',
      productionUsername: 'nexeloq_bot',
      token: 'local-token',
      username: 'nexeloq_dev_bot',
    };
    const service = new TelegramChannelAccessService(
      prisma as never,
      {} as never,
      {} as never,
      sourceAccess as never,
      {} as never,
      botApi as never,
      config as never,
      support as never,
    );
    return { service, prisma, sourceAccess, botApi };
  }

  it('uses the stable numeric chat id when a possibly stale username also exists', () => {
    const { service } = setup();

    expect(
      service.botChatId({
        username: 'old_channel_name',
        telegramChatId: '-1001234567890',
      }),
    ).toBe('-1001234567890');
  });

  it('refreshes actual production-bot membership before persisting access', async () => {
    const { service, prisma, sourceAccess, botApi } = setup();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      title: 'Business Patterns',
      username: 'old_channel_name',
      telegramChatId: '-1001234567890',
    });

    await service.checkProductionBotPublishingAccess('user-1', 'channel-1');

    expect(botApi.getMe).toHaveBeenCalledWith('production-token');
    expect(botApi.getChatMember).toHaveBeenCalledWith(
      'production-token',
      '-1001234567890',
      '42',
    );
    expect(sourceAccess.upsertAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        channelId: 'channel-1',
        sourceId: 'system-bot-production',
        permissions: expect.objectContaining({ canPostMessages: true }),
      }),
    );
  });

  it('confirms only the production System Bot when its only granted right is posting', async () => {
    const { service, prisma, sourceAccess, botApi } = setup();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      username: 'business_patterns',
      telegramChatId: '-1001234567890',
    });
    sourceAccess.normalizeBotPermissions.mockReturnValue({
      role: 'ADMIN',
      permissions: {
        ...sourceAccess.emptyPermissions(),
        canPostMessages: true,
      },
    });
    botApi.getChatMember.mockResolvedValue({
      status: 'administrator',
      can_post_messages: true,
    });

    const result = await service.checkProductionSystemBotPublishingAccess(
      'user-1',
      'channel-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        status: 'CONNECTED',
        botUsername: 'nexeloq_bot',
        requiredPermission: 'POST_MESSAGES',
      }),
    );
    expect(sourceAccess.upsertAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        sourceId: 'system-bot-production',
        permissions: expect.objectContaining({ canPostMessages: true }),
      }),
    );
    expect(botApi.getMe).toHaveBeenCalledWith('production-token');
    expect(botApi.getMe).not.toHaveBeenCalledWith('local-token');
  });

  it('clears stale access and reports an unconfirmed bot when it is absent', async () => {
    const { service, prisma, sourceAccess, botApi } = setup();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      username: 'business_patterns',
      telegramChatId: '-1001234567890',
    });
    botApi.getChatMember.mockRejectedValue(
      new TelegramBotApiError('chat not found', 'BLOCKED'),
    );

    const result = await service.checkProductionSystemBotPublishingAccess(
      'user-1',
      'channel-1',
    );

    expect(result).toEqual(
      expect.objectContaining({
        connected: false,
        status: 'NOT_CONNECTED',
      }),
    );
    expect(sourceAccess.upsertAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        permissions: expect.objectContaining({ canPostMessages: false }),
      }),
    );
  });

  it('distinguishes a missing Post Messages permission from a missing bot', async () => {
    const { service, prisma, sourceAccess } = setup();
    prisma.telegramChannel.findFirst.mockResolvedValue({
      id: 'channel-1',
      username: 'business_patterns',
      telegramChatId: '-1001234567890',
    });
    sourceAccess.normalizeBotPermissions.mockReturnValue({
      role: 'ADMIN',
      permissions: sourceAccess.emptyPermissions(),
    });

    const result = await service.checkProductionSystemBotPublishingAccess(
      'user-1',
      'channel-1',
    );

    expect(result.status).toBe('MISSING_POST_PERMISSION');
    expect(result.connected).toBe(false);
  });
});
