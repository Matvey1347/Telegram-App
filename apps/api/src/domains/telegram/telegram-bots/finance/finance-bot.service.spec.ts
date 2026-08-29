import { FinanceBotService } from './finance-bot.service';
import {
  parseFinanceBrowserLoginToken,
  parseFinanceChatCommand,
  parseFinanceMenuText,
  parseFinanceQuickInput,
} from './finance-chat-input-parser';
import { FinanceBotChatResponderService } from './finance-bot-chat-responder.service';
import {
  financeMainMenu,
  financeMiniAppUrl,
} from '../../consumer-finance/telegram-presentation/finance-telegram-menu';

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

describe('parseFinanceMenuText', () => {
  it.each([
    ['⚙️ Settings', 'settings'],
    ['⚙️ Настройки', 'settings'],
    ['⚙️ Налаштування', 'settings'],
    ['💸 Add expense', 'expense'],
    ['💸 Добавить расход', 'expense'],
    ['💸 Додати витрату', 'expense'],
  ])(
    'keeps a stale localized Telegram keyboard action usable: %s',
    (input, expected) => {
      expect(parseFinanceMenuText(input)).toBe(expected);
    },
  );

  it('does not interpret ordinary text as a menu action', () => {
    expect(parseFinanceMenuText('Settings for next month')).toBeNull();
  });
});

describe('parseFinanceBrowserLoginToken', () => {
  it('extracts only a bounded Finance browser-login deep link', () => {
    const token = 'a'.repeat(32);
    expect(parseFinanceBrowserLoginToken(`/start finlogin_${token}`)).toBe(
      token,
    );
    expect(parseFinanceBrowserLoginToken('/start finlogin_short')).toBeNull();
    expect(parseFinanceBrowserLoginToken(`/start other_${token}`)).toBeNull();
  });
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
    const telegramUser = {
      id: 'telegram-user-1',
      telegramChatId: 'chat-1',
      languageCode: null,
    };
    const users = {
      actorFromUpdate: jest.fn().mockReturnValue({ id: 'telegram-id' }),
      upsertFromUpdate: jest
        .fn()
        .mockResolvedValue(telegramUser),
    };
    const contexts = {
      findBotUpdateContext: jest.fn().mockResolvedValue({
        telegramUser,
        profile,
      }),
      ensureProfile: jest.fn().mockResolvedValue(profile),
    };
    const proposals = {
      confirm: jest.fn(),
      cancel: jest.fn(),
      createQuick: jest.fn(),
      createBatch: jest.fn(),
    };
    const delivery = {
      send: jest.fn().mockResolvedValue(undefined),
      edit: jest.fn().mockResolvedValue(undefined),
    };
    const durable = {
      enqueueSendMessage: jest.fn().mockResolvedValue(undefined),
    };
    const ai = {
      extractText: jest.fn(),
      extractReceipt: jest.fn(),
      transcribeVoice: jest.fn(),
    };
    const entitlements = { has: jest.fn() };
    const botApi = {
      answerCallbackQuery: jest.fn().mockResolvedValue(true),
      sendChatAction: jest.fn().mockResolvedValue(true),
      deleteMessage: jest.fn().mockResolvedValue(true),
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
      startAccount: jest.fn(),
      cancel: jest.fn(),
      cancelFlow: jest.fn(),
      consume: jest.fn().mockResolvedValue(null),
      consumeText: jest.fn().mockResolvedValue(null),
      consumeCallback: jest.fn(),
      currencyKeyboard: jest.fn(),
      activeAccounts: jest.fn(),
      expectsIcon: jest.fn().mockResolvedValue(false),
      consumeIcon: jest.fn().mockResolvedValue(null),
      startTransfer: jest.fn(),
      startTransaction: jest.fn(),
      bindMessage: jest.fn().mockResolvedValue(undefined),
    };
    const flowPresenter = {
      present: jest.fn(),
      completionText: jest.fn().mockReturnValue('Saved'),
    };
    const browserLogin = {
      handle: jest.fn().mockResolvedValue(false),
    };
    const iconInput = {
      text: jest.fn().mockReturnValue(null),
      consume: jest.fn().mockResolvedValue({ handled: false }),
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
      browserLogin as any,
      iconInput as any,
      flowPresenter as any,
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
      browserLogin,
      flowPresenter,
      ...overrides,
    };
  }

  it('approves a browser login deep link for the current bot user', async () => {
    const test = service();
    const token = 'a'.repeat(32);
    test.browserLogin.handle.mockResolvedValue(true);

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'update-1',
      update: {
        message: {
          text: `/start finlogin_${token}`,
          chat: { id: 'chat-1' },
        },
      },
    });

    expect(test.browserLogin.handle).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'bot-token' }),
      'chat-1',
      'profile-1',
      'en',
    );
    expect(test.chat.sendMainMenu).not.toHaveBeenCalled();
  });

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

  it('routes a stale English settings button under a Russian profile instead of parsing it as finance input', async () => {
    const test = service();
    test.contexts.ensureProfile.mockResolvedValue({ ...profile, locale: 'ru' });

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'stale-settings-button',
      update: {
        message: { text: '⚙️ Settings', chat: { id: 'chat-1' } },
      },
    } as any);

    expect(test.chat.sendSettings).toHaveBeenCalledWith(
      expect.anything(),
      'chat-1',
      'ru',
      'USD',
    );
    expect(test.proposals.createQuick).not.toHaveBeenCalled();
  });

  it('acknowledges proposal callbacks and keeps failure details out of chat', async () => {
    const test = service();
    test.proposals.confirm.mockRejectedValue(
      new Error('database credentials leaked'),
    );

    await test.instance.handle({
      bot,
      runtime,
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
    expect(
      test.botApi.answerCallbackQuery.mock.invocationCallOrder[0],
    ).toBeLessThan(
      test.contexts.findBotUpdateContext.mock.invocationCallOrder[0],
    );
    expect(test.contexts.findBotUpdateContext).toHaveBeenCalledTimes(1);
    expect(test.contexts.ensureProfile).toHaveBeenCalledWith(
      'finance-bot',
      'telegram-user-1',
      profile,
    );
    expect(test.proposals.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'proposal-1',
        botIntegrationId: 'finance-bot',
        telegramBotUserId: 'telegram-user-1',
        profile: { ...profile, workspaceId: 'workspace-1' },
      }),
    );
    expect(test.delivery.send).toHaveBeenCalledWith(
      'bot-token',
      'chat-1',
      expect.objectContaining({
        text: 'That proposal is no longer available. Please create a new one and try again.',
      }),
    );
    expect(JSON.stringify(test.delivery.send.mock.calls)).not.toContain(
      'credentials',
    );
  });

  it('sends post-commit proposal confirmation immediately without durable delivery', async () => {
    const test = service();
    test.proposals.confirm.mockResolvedValue({
      transactionId: 'tx-1',
      transactionIds: ['tx-1'],
    });

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'update-saved',
      update: {
        callback_query: {
          id: 'callback-saved',
          data: 'fin:save:proposal-1',
          from: { id: 'telegram-id' },
          message: { chat: { id: 'chat-1' } },
        },
      },
    } as any);

    expect(test.delivery.send).toHaveBeenCalledWith('bot-token', 'chat-1', {
      text: 'Transaction saved. You can undo it in Finance for the next 10 minutes.',
    });
    expect(test.durable.enqueueSendMessage).not.toHaveBeenCalled();
  });

  it('sends a completed live flow immediately without enqueueing a delivery row', async () => {
    const test = service();
    test.flows.consumeCallback.mockResolvedValue({
      kind: 'created',
      flow: 'TRANSACTION_CREATE',
      id: 'tx-1',
      payload: { type: 'EXPENSE' },
    });
    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'flow-saved',
      update: {
        callback_query: {
          id: 'callback-flow',
          data: 'fin:flow:confirm:rev-1',
          from: { id: 'telegram-id' },
          message: { chat: { id: 'chat-1' } },
        },
      },
    } as any);
    expect(test.delivery.send).toHaveBeenCalledWith('bot-token', 'chat-1', {
      text: 'Saved',
      removeInlineKeyboard: true,
    });
    expect(test.durable.enqueueSendMessage).not.toHaveBeenCalled();
  });

  it('sends the Web App CTA through the durable delivery payload', async () => {
    const test = service();
    const previous = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example';
    try {
      await test.instance.handle({
        bot,
        runtime,
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
      if (previous === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previous;
    }
    expect(test.chat.sendMainMenu).toHaveBeenCalledWith(
      expect.anything(),
      'telegram-user-1',
      'chat-1',
      'en',
    );
  });

  it('reuses one established context read for help', async () => {
    const test = service();

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'help-established',
      update: {
        message: {
          text: '/help',
          chat: { id: 'chat-1' },
          from: { id: 'telegram-id' },
        },
      },
    } as any);

    expect(test.contexts.findBotUpdateContext).toHaveBeenCalledTimes(1);
    expect(test.users.upsertFromUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        existingUser: expect.objectContaining({ id: 'telegram-user-1' }),
      }),
    );
    expect(test.contexts.ensureProfile).toHaveBeenCalledWith(
      'finance-bot',
      'telegram-user-1',
      profile,
    );
    expect(test.delivery.send).toHaveBeenCalledTimes(1);
  });

  it('does not let an active draft swallow commands or persistent menu actions', async () => {
    const test = service();
    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'menu-over-draft',
      update: { message: { text: '/start', chat: { id: 'chat-1' } } },
    } as any);
    expect(test.flows.consumeText).not.toHaveBeenCalled();
    expect(test.chat.sendMainMenu).toHaveBeenCalled();
  });

  it.each([
    ['/income', 'INCOME'],
    ['/expense', 'EXPENSE'],
  ] as const)(
    'starts %s once and sends its account picker',
    async (text, type) => {
      const test = service();
      const result = {
        kind: 'prompt',
        flow: 'TRANSACTION_CREATE',
        step: 'TRANSACTION_ACCOUNT',
        payload: { type },
        choices: [{ id: 'a-1', label: 'Cash · USD' }],
      };
      test.flows.startTransaction.mockResolvedValue(result);
      test.flowPresenter.present.mockResolvedValue({
        text: 'Choose account',
        inlineButtons: [],
      });

      await test.instance.handle({
        bot,
        runtime,
        token: 'bot-token',
        updateLogId: `start-${type}`,
        update: {
          message: {
            text,
            chat: { id: 'chat-1' },
            from: { id: 'telegram-id' },
          },
        },
      } as any);

      expect(test.flows.startTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type }),
      );
      expect(test.flows.activeAccounts).not.toHaveBeenCalled();
      expect(test.delivery.send).toHaveBeenCalledWith(
        'bot-token',
        'chat-1',
        expect.objectContaining({ text: 'Choose account' }),
      );
    },
  );

  it('replaces the account step with category choices and keeps Back in one message', async () => {
    const test = service();
    test.flows.consumeCallback.mockResolvedValue({
      kind: 'prompt',
      flow: 'TRANSACTION_CREATE',
      step: 'TRANSACTION_CATEGORY',
      payload: {
        type: 'INCOME',
        revision: 'rev-1',
        accountId: 'a-1',
        accountName: 'Cash',
        accountCurrency: 'USD',
      },
    });
    test.flowPresenter.present.mockResolvedValue({
      text: 'Choose category',
      inlineButtons: [[{ text: 'Back', callbackData: 'fin:flow:back:rev-1' }]],
    });

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'income-account-selected',
      update: {
        callback_query: {
          id: 'callback-account',
          data: 'fin:flow:account:rev-1.a-1',
          from: { id: 'telegram-id' },
          message: { message_id: 73, chat: { id: 'chat-1' } },
        },
      },
    } as any);

    expect(test.delivery.edit).toHaveBeenCalledWith(
      'bot-token',
      'chat-1',
      73,
      expect.objectContaining({ text: 'Choose category' }),
    );
    expect(test.delivery.send).not.toHaveBeenCalled();
  });

  it('sends the next step normally when Telegram can no longer edit the old prompt', async () => {
    const test = service();
    test.delivery.edit.mockRejectedValueOnce(new Error('message not editable'));
    test.flows.consumeCallback.mockResolvedValue({
      kind: 'prompt',
      flow: 'TRANSACTION_CREATE',
      step: 'TRANSACTION_CATEGORY',
      payload: { type: 'INCOME', revision: 'rev-1', accountId: 'a-1' },
    });
    test.flowPresenter.present.mockResolvedValue({
      text: 'Choose category',
      inlineButtons: [],
    });

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'income-edit-fallback',
      update: {
        callback_query: {
          id: 'callback-account',
          data: 'fin:flow:account:rev-1.a-1',
          from: { id: 'telegram-id' },
          message: { message_id: 73, chat: { id: 'chat-1' } },
        },
      },
    } as any);

    expect(test.delivery.send).toHaveBeenCalledWith(
      'bot-token',
      'chat-1',
      expect.objectContaining({ text: 'Choose category' }),
    );
  });

  it('deletes an accepted amount and edits the tracked flow message', async () => {
    const test = service();
    test.flows.consumeText.mockResolvedValue({
      kind: 'prompt',
      flow: 'TRANSACTION_CREATE',
      step: 'TRANSACTION_DESCRIPTION',
      payload: { revision: 'rev-1', messageId: '73', amount: '100' },
    });
    test.flowPresenter.present.mockResolvedValue({
      text: 'Optional comment',
      inlineButtons: [],
    });

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'amount-accepted',
      update: {
        message: {
          message_id: 91,
          text: '100',
          chat: { id: 'chat-1' },
          from: { id: 'telegram-id' },
        },
      },
    } as any);

    expect(test.botApi.deleteMessage).toHaveBeenCalledWith('bot-token', {
      chat_id: 'chat-1',
      message_id: 91,
    });
    expect(test.delivery.edit).toHaveBeenCalledWith(
      'bot-token',
      'chat-1',
      73,
      expect.objectContaining({ text: 'Optional comment' }),
    );
    expect(test.delivery.send).not.toHaveBeenCalled();
  });

  it('finalizes confirm in place and removes every stale action', async () => {
    const test = service();
    test.flows.consumeCallback.mockResolvedValue({
      kind: 'created',
      flow: 'TRANSACTION_CREATE',
      id: 'tx-1',
      payload: { revision: 'rev-1', messageId: '73' },
    });

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'flow-confirmed-in-place',
      update: {
        callback_query: {
          id: 'callback-confirm',
          data: 'fin:flow:confirm:rev-1',
          from: { id: 'telegram-id' },
          message: { message_id: 73, chat: { id: 'chat-1' } },
        },
      },
    } as any);

    expect(test.delivery.edit).toHaveBeenCalledWith('bot-token', 'chat-1', 73, {
      text: 'Saved',
      removeInlineKeyboard: true,
    });
    expect(test.delivery.send).not.toHaveBeenCalled();
  });

  it('acknowledges a repeated finalized callback without posting an unavailable message', async () => {
    const test = service();
    test.flows.consumeCallback.mockResolvedValue(null);

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'flow-confirmed-twice',
      update: {
        callback_query: {
          id: 'callback-confirm-again',
          data: 'fin:flow:confirm:rev-1',
          from: { id: 'telegram-id' },
          message: { message_id: 73, chat: { id: 'chat-1' } },
        },
      },
    } as any);

    expect(test.botApi.answerCallbackQuery).toHaveBeenCalled();
    expect(test.chat.sendSafe).not.toHaveBeenCalled();
    expect(test.delivery.send).not.toHaveBeenCalled();
  });

  it('offers account creation when a transaction has no active account', async () => {
    const test = service();
    test.flows.startTransaction.mockResolvedValue(null);
    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'no-account',
      update: {
        message: {
          text: '/expense',
          chat: { id: 'chat-1' },
          from: { id: 'telegram-id' },
        },
      },
    } as any);
    expect(test.chat.sendAccounts).toHaveBeenCalledWith(
      expect.anything(),
      'telegram-user-1',
      { ...profile, workspaceId: 'workspace-1' },
      'chat-1',
      'en',
    );
  });

  it('passes established profile currency and workspace into accounts rendering', async () => {
    const test = service();

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'accounts-established',
      update: {
        message: {
          text: '/accounts',
          chat: { id: 'chat-1' },
          from: { id: 'telegram-id' },
        },
      },
    } as any);

    expect(test.contexts.findBotUpdateContext).toHaveBeenCalledTimes(1);
    expect(test.chat.sendAccounts).toHaveBeenCalledWith(
      expect.anything(),
      'telegram-user-1',
      { ...profile, workspaceId: 'workspace-1' },
      'chat-1',
      'en',
    );
  });

  it('starts the guided transfer immediately when two active accounts exist', async () => {
    const test = service();
    test.flows.activeAccounts.mockResolvedValue([{ id: 'a-1' }, { id: 'a-2' }]);
    test.flows.startTransfer.mockResolvedValue({
      kind: 'prompt',
      flow: 'TRANSFER_CREATE',
      step: 'TRANSFER_DESCRIPTION',
      payload: {},
    });

    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'update-transfer',
      update: {
        message: {
          text: '/transfer',
          chat: { id: 'chat-1' },
          from: { id: 'telegram-id' },
        },
      },
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
      { setChatMenuButton: jest.fn().mockResolvedValue(true) } as any,
    );
    const previous = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example';
    try {
      await responder.sendMainMenu(
        { bot, updateLogId: 'update-3', update: {} } as any,
        'telegram-user-1',
        'chat-1',
      );
    } finally {
      if (previous === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previous;
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
      { setChatMenuButton: jest.fn().mockResolvedValue(true) } as any,
    );
    const context = { bot, updateLogId: 'update-3', update: {} } as any;

    await responder.sendMainMenu(context, 'telegram-user-1', 'chat-1');
    await responder.sendMainMenu(context, 'telegram-user-1', 'chat-1');
    await responder.sendMainMenu(
      { ...context, updateLogId: 'update-4' },
      'telegram-user-1',
      'chat-1',
    );

    expect(delivery.send).toHaveBeenCalledTimes(3);
  });

  it('localizes a Ukrainian quick-transaction preview including amount labels', async () => {
    const test = service();
    test.contexts.ensureProfile.mockResolvedValue({ ...profile, locale: 'uk' });
    test.proposals.createQuick.mockResolvedValue({
      token: 'proposal-1',
      payload: {
        type: 'EXPENSE',
        amount: '25',
        currency: 'UAH',
        description: null,
      },
      category: { name: 'Food' },
      account: { name: 'Cash' },
    });
    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'uk-preview',
      update: { message: { text: '25 кава', chat: { id: 'chat-1' } } },
    } as any);
    expect(test.delivery.send).toHaveBeenCalledWith(
      'bot-token',
      'chat-1',
      expect.objectContaining({
        text: expect.stringContaining('Сума: 25 UAH'),
      }),
    );
  });

  it('localizes Russian receipt proposal titles and previews', async () => {
    const test = service();
    test.contexts.ensureProfile.mockResolvedValue({ ...profile, locale: 'ru' });
    test.entitlements.has.mockResolvedValue(true);
    test.botApi.getFile.mockResolvedValue({ file_path: 'receipt.jpg' });
    test.botApi.downloadFile.mockResolvedValue({
      bytes: Buffer.from('image'),
      contentType: 'image/jpeg',
    });
    test.ai.extractReceipt.mockResolvedValue([{ amount: '9' }]);
    test.proposals.createBatch.mockResolvedValue({
      token: 'proposal-2',
      preview: [],
      operations: [{}],
    });
    test.chat.batchPreview.mockReturnValue('💸 Расход — 9 RUB');
    await test.instance.handle({
      bot,
      runtime,
      token: 'bot-token',
      updateLogId: 'ru-receipt',
      update: {
        message: { photo: [{ file_id: 'photo-1' }], chat: { id: 'chat-1' } },
      },
    } as any);
    expect(test.chat.batchPreview).toHaveBeenCalledWith([], 'ru');
    expect(test.delivery.send).toHaveBeenCalledWith(
      'bot-token',
      'chat-1',
      expect.objectContaining({
        text: expect.stringContaining('Предложение из чека'),
      }),
    );
  });

  it('renders batch preview labels in Ukrainian and Russian', () => {
    const responder = new FinanceBotChatResponderService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const items = [
      {
        payload: {
          type: 'EXPENSE' as const,
          amount: '10',
          currency: 'UAH',
          description: null,
        },
        accountName: 'Cash',
        categoryName: null,
      },
    ];
    expect(responder.batchPreview(items, 'uk')).toContain('💸 Витрата');
    expect(responder.batchPreview(items, 'ru')).toContain('💸 Расход');
  });
});
