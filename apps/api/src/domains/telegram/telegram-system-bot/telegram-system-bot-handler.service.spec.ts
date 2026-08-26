/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- focused handler test doubles */
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';

describe('TelegramSystemBotHandlerService', () => {
  function workflowHarness() {
    const api = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 99 }),
      deleteMessage: jest.fn().mockResolvedValue(true),
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
    } as any;
    const connections = {
      requireEnabledConnection: jest.fn().mockResolvedValue({
        id: 'connection',
        userId: 'user',
        telegramUserId: '44',
      }),
      requireCurrentWorkspace: jest.fn().mockResolvedValue({
        workspaceId: 'workspace',
        role: 'admin',
        workspace: {
          name: 'Business',
          timezone: 'Europe/Warsaw',
        },
      }),
    } as any;
    const finance = {
      menu: jest.fn(),
      callback: jest.fn(),
      pendingInput: jest.fn().mockResolvedValue(null),
    } as any;
    const postFlow = {
      begin: jest.fn().mockResolvedValue({ handled: 'post-begin' }),
      isCallback: jest.fn().mockReturnValue(false),
      callback: jest.fn(),
      input: jest.fn().mockResolvedValue(null),
    } as any;
    const adSaleFlow = {
      begin: jest.fn().mockResolvedValue({ handled: 'ad-begin' }),
      isCallback: jest.fn().mockReturnValue(false),
      callback: jest.fn(),
      input: jest.fn().mockResolvedValue(null),
    } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      {} as any,
      finance,
      postFlow,
      adSaleFlow,
    );
    return { service, api, connections, finance, postFlow, adSaleFlow };
  }

  it('opens the Ad Sale workflow from the website deep link', async () => {
    const test = workflowHarness();

    await expect(
      test.service.handle({
        message: {
          chat: { id: 44, type: 'private' },
          from: { id: 44 },
          text: '/start ad_sale',
        },
      }),
    ).resolves.toEqual({ handled: 'ad-begin' });

    expect(test.adSaleFlow.begin).toHaveBeenCalledWith({
      chatId: '44',
      connectionId: 'connection',
      userId: 'user',
      telegramUserId: '44',
      workspaceId: 'workspace',
      timezone: 'Europe/Warsaw',
    });
  });

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

  it('opens all workspace channels through the channel access service', async () => {
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
    const channelAccess = { list: jest.fn().mockResolvedValue([]) } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      channelAccess,
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

    expect(channelAccess.list).toHaveBeenCalledWith('44', 'workspace');
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
    const channelAccess = { list: jest.fn().mockResolvedValue([]) } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      api,
      connections,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      channelAccess,
    );

    await service.handle({
      update_id: 4,
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44 },
        text: 'Channels',
      },
    });

    expect(channelAccess.list).toHaveBeenCalledWith('44', 'workspace');
  });

  it('handles channel membership updates before the private-chat guard', async () => {
    const channelAccess = { handleMyChatMember: jest.fn() } as any;
    const connections = { requireEnabledConnection: jest.fn() } as any;
    const service = new TelegramSystemBotHandlerService(
      { token: 'token' } as any,
      {} as any,
      connections,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      channelAccess,
    );
    const membership = {
      chat: { id: -1001, type: 'channel', title: 'News' },
      old_chat_member: { status: 'member', user: { id: 7 } },
      new_chat_member: { status: 'administrator', user: { id: 7 } },
    };

    await service.handle({ update_id: 5, my_chat_member: membership });

    expect(channelAccess.handleMyChatMember).toHaveBeenCalledWith(membership);
    expect(connections.requireEnabledConnection).not.toHaveBeenCalled();
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
        text: expect.stringContaining('✅ Profit: <b>180 UAH</b>'),
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

  it('routes /post and forwarded messages to the post flow', async () => {
    const test = workflowHarness();

    await test.service.handle({
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44 },
        text: '/post',
      },
    });
    const forwardedMessage = {
      chat: { id: 44, type: 'private' },
      from: { id: 44 },
      forward_origin: { type: 'channel' as const },
      photo: [{ file_id: 'photo-1' }],
    };
    await test.service.handle({ message: forwardedMessage });

    expect(test.postFlow.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: 'connection',
        workspaceId: 'workspace',
        timezone: 'Europe/Warsaw',
      }),
    );
    expect(test.postFlow.input).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace' }),
      forwardedMessage,
    );
  });

  it('routes /adsale, ad callbacks and active ad input to the ad sale flow', async () => {
    const test = workflowHarness();

    await test.service.handle({
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44 },
        text: '/adsale',
      },
    });
    test.adSaleFlow.isCallback.mockImplementation((value: string) =>
      value.startsWith('ad:'),
    );
    await test.service.handle({
      callback_query: {
        id: 'callback-1',
        data: 'ad:account:0',
        from: { id: 44 },
        message: { chat: { id: 44, type: 'private' } },
      },
    });
    test.adSaleFlow.input.mockResolvedValue({ handled: 'ad-input' });
    const amountMessage = {
      chat: { id: 44, type: 'private' },
      from: { id: 44 },
      text: '1250',
    };
    await test.service.handle({ message: amountMessage });

    expect(test.adSaleFlow.begin).toHaveBeenCalled();
    expect(test.adSaleFlow.callback).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace' }),
      'ad:account:0',
    );
    expect(test.adSaleFlow.input).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'connection' }),
      amountMessage,
    );
    expect(test.finance.pendingInput).not.toHaveBeenCalled();
  });

  it('keeps pending finance text ahead of the generic post input', async () => {
    const test = workflowHarness();
    test.finance.pendingInput.mockResolvedValue({ handled: 'finance-input' });

    await test.service.handle({
      message: {
        chat: { id: 44, type: 'private' },
        from: { id: 44 },
        text: '125 client payment',
      },
    });

    expect(test.adSaleFlow.input).toHaveBeenCalled();
    expect(test.finance.pendingInput).toHaveBeenCalledWith(
      expect.objectContaining({ text: '125 client payment' }),
    );
    expect(test.postFlow.input).not.toHaveBeenCalled();
  });

  it('does not dispatch workflows from a non-private chat', async () => {
    const test = workflowHarness();

    await test.service.handle({
      message: {
        chat: { id: -100123, type: 'supergroup' },
        from: { id: 44 },
        text: '/post',
      },
    });

    expect(test.connections.requireEnabledConnection).not.toHaveBeenCalled();
    expect(test.postFlow.begin).not.toHaveBeenCalled();
    expect(test.adSaleFlow.begin).not.toHaveBeenCalled();
  });
});
