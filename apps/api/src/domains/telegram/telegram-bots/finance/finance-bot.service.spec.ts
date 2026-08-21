import {
  FinanceBotService,
  parseFinanceChatCommand,
  parseFinanceQuickInput,
} from './finance-bot.service';
import {
  FinanceBotChatResponderService,
  financeMainMenu,
  financeMiniAppUrl,
} from './finance-bot-chat-responder.service';

describe('parseFinanceQuickInput', () => {
  it.each([
    ['250 Сільпо', { type: 'EXPENSE', amount: '250', description: 'Сільпо' }],
    [
      '+30000 зарплата',
      { type: 'INCOME', amount: '30000', description: 'зарплата' },
    ],
    [
      '12,50 coffee',
      { type: 'EXPENSE', amount: '12.50', description: 'coffee' },
    ],
  ])('parses %s without writing a transaction', (input, expected) =>
    expect(parseFinanceQuickInput(input)).toEqual(expected),
  );
  it('does not treat arbitrary prose as deterministic input', () =>
    expect(parseFinanceQuickInput('today I bought coffee')).toBeNull());
});

describe('parseFinanceChatCommand', () => {
  it.each([
    ['/start', 'start'],
    ['/start campaign-42', 'start'],
    ['/income@finance_bot', 'income'],
    ['/expense', 'expense'],
    ['/recent', 'recent'],
    ['/accounts', 'accounts'],
    ['/categories', 'categories'],
    ['/transfer', 'transfer'],
    ['/help', 'help'],
  ])('parses %s before free-form finance input', (input, expected) =>
    expect(parseFinanceChatCommand(input)).toBe(expected),
  );

  it('does not parse arbitrary slash text as a Finance command', () =>
    expect(parseFinanceChatCommand('/unknown 250 coffee')).toBeNull());
});

describe('FinanceBotService chat UX', () => {
  const bot = {
    id: 'finance-bot',
    workspaceId: 'workspace-1',
    botTokenEncrypted: 'encrypted',
    botTokenIv: 'iv',
    botTokenAuthTag: 'tag',
  } as any;
  const runtime = { id: 'runtime-1' } as any;
  const profile = { id: 'profile-1', defaultCurrency: 'USD', timezone: 'UTC' };

  function service(overrides: Record<string, unknown> = {}) {
    const users = {
      upsertFromUpdate: jest
        .fn()
        .mockResolvedValue({ id: 'telegram-user-1', telegramChatId: 'chat-1' }),
    };
    const contexts = { ensureProfile: jest.fn().mockResolvedValue(profile) };
    const proposals = {
      confirm: jest.fn(),
      cancel: jest.fn(),
      createQuick: jest.fn(),
      createBatch: jest.fn(),
    };
    const delivery = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const durable = { enqueueSendMessage: jest.fn().mockResolvedValue(undefined) };
    const ai = { extractText: jest.fn(), extractReceipt: jest.fn(), transcribeVoice: jest.fn() };
    const entitlements = { has: jest.fn() };
    const botApi = {
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      sendChatAction: jest.fn().mockResolvedValue(true),
      getFile: jest.fn(),
      downloadFile: jest.fn(),
    };
    const billing = {
      validateStarsPreCheckout: jest.fn(),
      processStarsPayment: jest.fn(),
    };
    const chat = {
      batchPreview: jest.fn().mockReturnValue('preview'),
      proposalButtons: jest.fn().mockReturnValue([]),
      sendSafe: jest.fn().mockResolvedValue(undefined),
      sendMainMenu: jest.fn().mockResolvedValue(undefined),
      sendFinanceCta: jest.fn().mockResolvedValue(undefined),
      sendRecentTransactions: jest.fn().mockResolvedValue(undefined),
      sendAccounts: jest.fn().mockResolvedValue(undefined),
      sendCategories: jest.fn().mockResolvedValue(undefined),
      sendTransfer: jest.fn().mockResolvedValue(undefined),
      sendSettings: jest.fn().mockResolvedValue(undefined),
    };
    const flows = {
      startAccount: jest.fn(), cancel: jest.fn(), consume: jest.fn().mockResolvedValue(null), consumeText: jest.fn().mockResolvedValue(null), currencyKeyboard: jest.fn(), activeAccounts: jest.fn(), startTransfer: jest.fn(), startTransaction: jest.fn(),
    };
    const instance = new FinanceBotService(
      users as any,
      contexts as any,
      proposals as any,
      delivery as any,
      durable as any,
      ai as any,
      entitlements as any,
      botApi as any,
      billing as any,
      chat as any,
      flows as any,
      { present: jest.fn() } as any,
    );
    return {
      instance,
      users,
      contexts,
      proposals,
      delivery,
      durable,
      ai,
      entitlements,
      botApi,
      chat,
      flows,
      ...overrides,
    };
  }

  it('builds a canonical Mini App URL and complete main-menu keyboard', () => {
    expect(financeMiniAppUrl('bot id', 'https://app.example/')).toBe(
      'https://app.example/finance/bot%20id',
    );
    expect(
      financeMainMenu('bot id')
        .flat()
        .map((item) => item.text),
    ).toEqual([
      '💸 Add expense',
      '💰 Add income',
      '📱 Open Finance',
      '🧾 Recent',
      '🏦 Accounts',
      '🏷️ Categories',
      '↔️ Transfer',
      '⚙️ Settings',
      '❓ Help',
    ]);
  });

  it('acknowledges proposal callbacks and keeps failure details out of chat', async () => {
    const test = service();
    test.proposals.confirm.mockRejectedValue(
      new Error('database credentials leaked'),
    );

    await test.instance.handle({
      bot, runtime,
      token: 'bot-token',
      updateLogId: 'update-1',
      update: {
        callback_query: {
          id: 'callback-1',
          data: 'fin:save:proposal-1',
          from: { id: 'telegram-id' },
          message: { chat: { id: 'chat-1' } },
        },
      },
    } as any);

    expect(test.botApi.answerCallbackQuery).toHaveBeenCalledWith('bot-token', {
      callback_query_id: 'callback-1',
      text: '',
    });
    expect(test.botApi.answerCallbackQuery.mock.invocationCallOrder[0]).toBeLessThan(
      test.users.upsertFromUpdate.mock.invocationCallOrder[0],
    );
    expect(test.proposals.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'proposal-1',
        botIntegrationId: 'finance-bot',
        telegramBotUserId: 'telegram-user-1',
        profile,
      }),
    );
    expect(test.delivery.send).toHaveBeenCalledWith(
      'bot-token', 'chat-1', expect.objectContaining({
        text: 'That proposal is no longer available. Please create a new one and try again.',
      }),
    );
    expect(
      JSON.stringify(test.delivery.send.mock.calls),
    ).not.toContain('credentials');
  });

  it('keeps post-commit proposal confirmation on durable delivery', async () => {
    const test = service();
    test.proposals.confirm.mockResolvedValue({ transactionId: 'tx-1', transactionIds: ['tx-1'] });

    await test.instance.handle({
      bot, runtime, token: 'bot-token', updateLogId: 'update-saved',
      update: { callback_query: { id: 'callback-saved', data: 'fin:save:proposal-1', from: { id: 'telegram-id' }, message: { chat: { id: 'chat-1' } } } },
    } as any);

    expect(test.durable.enqueueSendMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Transaction saved. You can undo it in Finance for the next 10 minutes.',
      idempotencyKey: expect.stringContaining('finance-proposal-saved:'),
    }));
  });

  it('sends the Web App CTA through the durable delivery payload', async () => {
    const test = service();
    const previous = process.env.FINANCE_MINI_APP_URL;
    process.env.FINANCE_MINI_APP_URL = 'https://app.example';
    try {
      await test.instance.handle({
        bot, runtime,
        updateLogId: 'update-2',
        update: {
          message: {
            text: '/start',
            chat: { id: 'chat-1' },
            from: { id: 'telegram-id' },
          },
        },
      } as any);
    } finally {
      if (previous === undefined) delete process.env.FINANCE_MINI_APP_URL;
      else process.env.FINANCE_MINI_APP_URL = previous;
    }
    expect(test.chat.sendMainMenu).toHaveBeenCalledWith(
      expect.anything(),
      'telegram-user-1',
      'chat-1',
      'en',
    );
  });

  it('does not let an active draft swallow commands or persistent menu actions', async () => {
    const test = service();
    await test.instance.handle({ bot, runtime, token: 'bot-token', updateLogId: 'menu-over-draft', update: { message: { text: '/start', chat: { id: 'chat-1' } } } } as any);
    expect(test.flows.consumeText).not.toHaveBeenCalled();
    expect(test.chat.sendMainMenu).toHaveBeenCalled();
  });

  it('starts the guided transfer immediately when two active accounts exist', async () => {
    const test = service();
    test.flows.activeAccounts.mockResolvedValue([{ id: 'a-1' }, { id: 'a-2' }]);
    test.flows.startTransfer.mockResolvedValue({ kind: 'prompt', flow: 'TRANSFER_CREATE', step: 'TRANSFER_DESCRIPTION', payload: {} });

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'update-transfer',
      update: { message: { text: '/transfer', chat: { id: 'chat-1' }, from: { id: 'telegram-id' } } },
    } as any);

    expect(test.flows.startTransfer).toHaveBeenCalled();
    expect(test.chat.sendTransfer).not.toHaveBeenCalled();
  });

  it('uses one reply keyboard payload for every quick action and the Web App', async () => {
    const delivery = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    const responder = new FinanceBotChatResponderService(
      delivery as any,
      {} as any,
      {} as any,
    );
    const previous = process.env.FINANCE_MINI_APP_URL;
    process.env.FINANCE_MINI_APP_URL = 'https://app.example';
    try {
      await responder.sendMainMenu(
        { bot, updateLogId: 'update-3', update: {} } as any,
        'telegram-user-1',
        'chat-1',
      );
    } finally {
      if (previous === undefined) delete process.env.FINANCE_MINI_APP_URL;
      else process.env.FINANCE_MINI_APP_URL = previous;
    }
    const payload = delivery.send.mock.calls[0][2];
    expect(payload.replyKeyboard).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({
            text: '📱 Open Finance',
            webAppUrl: 'https://app.example/finance/finance-bot',
          }),
        ]),
      ]),
    );
    expect(payload).not.toHaveProperty('inlineButtons');
  });

  it('uses the immediate path without delivery persistence', async () => {
    const delivery = { send: jest.fn().mockResolvedValue(undefined) };
    const responder = new FinanceBotChatResponderService(
      delivery as any,
      {} as any,
      {} as any,
    );
    const context = { bot, updateLogId: 'update-3', update: {} } as any;

    await responder.sendMainMenu(context, 'telegram-user-1', 'chat-1');
    await responder.sendMainMenu(context, 'telegram-user-1', 'chat-1');
    await responder.sendMainMenu({ ...context, updateLogId: 'update-4' }, 'telegram-user-1', 'chat-1');

    expect(delivery.send).toHaveBeenCalledTimes(3);
  });

  it('localizes a Ukrainian quick-transaction preview including amount labels', async () => {
    const test = service();
    test.contexts.ensureProfile.mockResolvedValue({ ...profile, locale: 'uk' });
    test.proposals.createQuick.mockResolvedValue({
      token: 'proposal-1', payload: { type: 'EXPENSE', amount: '25', currency: 'UAH', description: null },
      category: { name: 'Food' }, account: { name: 'Cash' },
    });
    await test.instance.handle({ bot, runtime, token: 'bot-token', updateLogId: 'uk-preview', update: { message: { text: '25 кава', chat: { id: 'chat-1' } } } } as any);
    expect(test.delivery.send).toHaveBeenCalledWith('bot-token', 'chat-1', expect.objectContaining({
      text: expect.stringContaining('Сума: 25 UAH'),
    }));
  });

  it('localizes Russian receipt proposal titles and previews', async () => {
    const test = service();
    test.contexts.ensureProfile.mockResolvedValue({ ...profile, locale: 'ru' });
    test.entitlements.has.mockResolvedValue(true);
    test.botApi.getFile.mockResolvedValue({ file_path: 'receipt.jpg' });
    test.botApi.downloadFile.mockResolvedValue({ bytes: Buffer.from('image'), contentType: 'image/jpeg' });
    test.ai.extractReceipt.mockResolvedValue([{ amount: '9' }]);
    test.proposals.createBatch.mockResolvedValue({ token: 'proposal-2', preview: [], operations: [{}] });
    test.chat.batchPreview.mockReturnValue('💸 Расход — 9 RUB');
    await test.instance.handle({ bot, runtime, token: 'bot-token', updateLogId: 'ru-receipt', update: { message: { photo: [{ file_id: 'photo-1' }], chat: { id: 'chat-1' } } } } as any);
    expect(test.chat.batchPreview).toHaveBeenCalledWith([], 'ru');
    expect(test.delivery.send).toHaveBeenCalledWith('bot-token', 'chat-1', expect.objectContaining({
      text: expect.stringContaining('Предложение из чека'),
    }));
  });

  it('renders batch preview labels in Ukrainian and Russian', () => {
    const responder = new FinanceBotChatResponderService({} as any, {} as any, {} as any);
    const items = [{ payload: { type: 'EXPENSE' as const, amount: '10', currency: 'UAH', description: null }, accountName: 'Cash', categoryName: null }];
    expect(responder.batchPreview(items, 'uk')).toContain('💸 Витрата');
    expect(responder.batchPreview(items, 'ru')).toContain('💸 Расход');
  });
});
