import { TelegramChannelAccessService } from './telegram-channel-access.service';

describe('TelegramChannelAccessService production bot access', () => {
  function setup() {
    const prisma = {
      telegramChannel: { findFirst: jest.fn() },
    };
    const sourceAccess = {
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
      getMe: jest.fn().mockResolvedValue({ id: 42, username: 'system_bot' }),
      getChatMember: jest.fn().mockResolvedValue({
        status: 'administrator',
        can_post_messages: true,
      }),
    };
    const support = {
      workspace: jest.fn().mockResolvedValue('workspace-1'),
      normalizeUsername: jest.fn((value?: string | null) =>
        value?.replace(/^@/, '') || null,
      ),
      normalizeChatId: jest.fn((value?: string | null) =>
        value?.replace(/^-100/, '') || null,
      ),
    };
    const config = { productionToken: 'production-token', token: 'local-token' };
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
});
