import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';

describe('TelegramSystemBotHandlerService', () => {
  it('stores the Telegram message id for a connection prompt', async () => {
    const api = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 91 }),
    } as any;
    const connections = {
      requireEnabledConnection: jest.fn().mockRejectedValue(new Error()),
      createLink: jest.fn().mockResolvedValue({
        id: 'link',
        url: 'https://app.example.test/system-bot/connect?token=token',
      }),
      storeLinkMessage: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      {} as any,
      {} as any,
    );

    await service.handle({
      update_id: 1,
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44, username: 'matviikpr' },
        text: '/start',
      },
    });

    expect(connections.storeLinkMessage).toHaveBeenCalledWith('link', 91);
  });

  it('removes the connection prompt and sends a collapsible bot menu after confirmation', async () => {
    const api = {
      deleteMessage: jest.fn().mockResolvedValue(true),
      sendMessage: jest.fn().mockResolvedValue({ message_id: 92 }),
    } as any;
    const connections = {
      requireCurrentWorkspace: jest.fn().mockResolvedValue({
        workspace: { name: 'Business' },
      }),
    } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      {} as any,
      {} as any,
    );

    await service.completeConnection({
      chatId: '44',
      messageId: 91,
      connectionId: 'connection',
    });

    expect(api.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: '44',
      message_id: 91,
    });
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        chat_id: '44',
        text: '🏢 Workspace: Business',
        reply_markup: expect.objectContaining({
          one_time_keyboard: false,
          keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '📢 Channels' }),
            ]),
          ]),
        }),
      }),
    );
    expect(api.sendMessage.mock.calls[0][1].reply_markup).not.toHaveProperty(
      'is_persistent',
    );
  });

  it('passes the connected Telegram identity when opening channels', async () => {
    const api = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      answerCallbackQuery: jest.fn(),
    } as any;
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue({
        id: 'connection',
        userId: 'user',
        telegramUserId: 'telegram-user',
      }),
      requireCurrentWorkspace: jest.fn().mockResolvedValue({
        workspaceId: 'workspace',
        role: 'admin',
        workspace: { name: 'Business' },
      }),
    } as any;
    const domain = { channels: jest.fn().mockResolvedValue([]) } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      domain,
      {} as any,
    );

    await service.handle({
      update_id: 3,
      callback_query: {
        id: 'callback',
        data: 'channels',
        from: { id: 44 },
        message: { chat: { id: 44, type: 'private' } },
      },
    });

    expect(domain.channels).toHaveBeenCalledWith('workspace', 'telegram-user');
  });

  it('handles a persistent Channels keyboard button as the channels command', async () => {
    const api = {
      sendMessage: jest.fn(),
      answerCallbackQuery: jest.fn(),
    } as any;
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue({
        id: 'connection',
        userId: 'user',
        telegramUserId: 'telegram-user',
      }),
      requireCurrentWorkspace: jest.fn().mockResolvedValue({
        workspaceId: 'workspace',
        role: 'admin',
        workspace: { name: 'Business' },
      }),
    } as any;
    const domain = { channels: jest.fn().mockResolvedValue([]) } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      domain,
      {} as any,
    );

    await service.handle({
      update_id: 4,
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44 },
        text: 'Channels',
      },
    });

    expect(domain.channels).toHaveBeenCalledWith('workspace', 'telegram-user');
  });

  it('uses canonical full workspace sync and renders its structured summary', async () => {
    const api = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
      answerCallbackQuery: jest.fn(),
    } as any;
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue({
        id: 'connection',
        userId: 'user',
      }),
      requireCurrentWorkspace: jest.fn().mockResolvedValue({
        workspaceId: 'workspace',
        role: 'admin',
        workspace: { name: 'Business' },
      }),
    } as any;
    const domain = {
      syncAll: jest.fn().mockResolvedValue({
        workspaceName: 'Business',
        total: 3,
        successful: 2,
        failed: 1,
        skipped: 0,
        durationMs: 2_000,
        failures: [{ channelTitle: 'News', reason: 'Authorization failed' }],
      }),
    } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      domain,
      {} as any,
    );

    await service.handle({
      update_id: 1,
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44 },
        text: '/sync',
      },
    });

    expect(domain.syncAll).toHaveBeenCalledWith('workspace', 'user');
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining(
          '🏢 Workspace: Business\n📢 Channels: 3\n✅ Successful: 2\n❌ Failed: 1',
        ),
      }),
    );
  });

  it('renders statistics from the actual dashboard summary contract', async () => {
    const api = {
      sendMessage: jest
        .fn()
        .mockResolvedValueOnce({ message_id: 99 })
        .mockResolvedValue({ message_id: 100 }),
      deleteMessage: jest.fn().mockResolvedValue(true),
    } as any;
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue({
        id: 'connection',
        userId: 'user',
      }),
      requireCurrentWorkspace: jest.fn().mockResolvedValue({
        workspaceId: 'workspace',
        role: 'admin',
        workspace: { name: 'Business' },
      }),
    } as any;
    const domain = {
      stats: jest.fn().mockResolvedValue({
        telegramChannelsCount: 3,
        ownChannelsCount: 2,
        externalChannelsCount: 1,
        totalSubscribers: 1_250,
        totalBalancePrimary: 780,
        primaryCurrency: 'UAH',
        incomeForPeriod: 300,
        expensesForPeriod: 120,
        profitForPeriod: 180,
        workspaceMembersCount: 4,
      }),
    } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      domain,
      {} as any,
    );

    await service.handle({
      update_id: 5,
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44 },
        text: '/stats',
      },
    });

    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining(
          '📢 Channels: 3 (own 2, external 1)\n👥 Subscribers: 1,250',
        ),
      }),
    );
    expect(api.sendMessage).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({
        text: expect.stringContaining('🧾 Profit: 180 UAH'),
      }),
    );
  });

  it('shows loading as a temporary chat message and removes it after the action', async () => {
    const api = {
      sendMessage: jest
        .fn()
        .mockResolvedValueOnce({ message_id: 99 })
        .mockResolvedValue({ message_id: 100 }),
      deleteMessage: jest.fn().mockResolvedValue(true),
    } as any;
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue({
        id: 'connection',
        userId: 'user',
        telegramUserId: 'telegram-user',
      }),
      requireCurrentWorkspace: jest.fn().mockResolvedValue({
        workspaceId: 'workspace',
        role: 'admin',
        workspace: { name: 'Business' },
      }),
    } as any;
    const domain = { channels: jest.fn().mockResolvedValue([]) } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      domain,
      {} as any,
    );

    await service.handle({
      update_id: 6,
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44 },
        text: '/channels',
      },
    });

    expect(api.sendMessage).toHaveBeenNthCalledWith(1, 'token', {
      chat_id: '44',
      text: '⏳ Loading…',
    });
    expect(api.deleteMessage).toHaveBeenCalledWith('token', {
      chat_id: '44',
      message_id: 99,
    });
  });

  it('switches workspace before requiring the stale current workspace', async () => {
    const api = {
      sendMessage: jest.fn(),
      answerCallbackQuery: jest.fn(),
    } as any;
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue({
        id: 'connection',
        userId: 'user',
      }),
      switchWorkspace: jest.fn().mockResolvedValue(undefined),
      requireCurrentWorkspace: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-b',
        role: 'admin',
        workspace: { name: 'Available' },
      }),
    } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      {} as any,
      {} as any,
    );

    await service.handle({
      update_id: 2,
      callback_query: {
        id: 'callback',
        data: 'workspace:workspace-b',
        from: { id: 44 },
        message: { chat: { id: 44, type: 'private' } },
      },
    });

    expect(connections.switchWorkspace).toHaveBeenCalledWith(
      'connection',
      'workspace-b',
    );
    expect(
      connections.switchWorkspace.mock.invocationCallOrder[0],
    ).toBeLessThan(
      connections.requireCurrentWorkspace.mock.invocationCallOrder[0],
    );
  });
});
