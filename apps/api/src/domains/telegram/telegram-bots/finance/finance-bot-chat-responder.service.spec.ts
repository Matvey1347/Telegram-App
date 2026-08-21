import { FinanceBotChatResponderService } from './finance-bot-chat-responder.service';

describe('FinanceBotChatResponderService', () => {
  const context = {
    token: 'bot-token',
    bot: { id: 'finance-bot' },
    updateLogId: 'update-1',
  } as any;
  const interactive = { send: jest.fn().mockResolvedValue(undefined) };
  const ledger = { history: jest.fn(), accounts: jest.fn() };
  const core = { categories: jest.fn() };
  const responder = new FinanceBotChatResponderService(
    interactive as any,
    ledger as any,
    core as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FINANCE_MINI_APP_URL = 'https://finance.example';
  });

  afterAll(() => delete process.env.FINANCE_MINI_APP_URL);

  it('returns a useful localized error when the compact recent read fails', async () => {
    ledger.history.mockRejectedValue(new Error('database unavailable'));

    await responder.sendRecentTransactions(context, 'user-1', 'profile-1', 'chat-1', 'uk');

    expect(interactive.send).toHaveBeenCalledWith('bot-token', 'chat-1', {
      text: expect.stringContaining('не вдалося завантажити'),
    });
  });

  it('keeps account actions bounded and two-column', async () => {
    ledger.accounts.mockResolvedValue(Array.from({ length: 14 }, (_, index) => ({
      id: `account-${index}`,
      name: `Account ${index}`,
      balance: '10',
      currency: 'USD',
      archivedAt: null,
    })));

    await responder.sendAccounts(context, 'user-1', 'profile-1', 'chat-1', 'en');

    const buttons = interactive.send.mock.calls[0][2].inlineButtons;
    expect(buttons.length).toBeLessThanOrEqual(6);
    expect(buttons.slice(1, -1).every((row: unknown[]) => row.length <= 2)).toBe(true);
  });

  it('shows localized bounded category edit and archive actions', async () => {
    core.categories.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({
      id: `category-${index}`,
      name: index === 0 ? 'Food' : `Category ${index}`,
      key: index === 0 ? 'food' : null,
      type: 'EXPENSE',
      archivedAt: null,
    })));

    await responder.sendCategories(context, 'user-1', 'profile-1', 'chat-1', 'uk');

    const buttons = interactive.send.mock.calls[0][2].inlineButtons;
    expect(buttons.length).toBeLessThanOrEqual(10);
    expect(buttons[1][0].text).toContain('Їжа');
    expect(buttons[1][1]).toEqual(expect.objectContaining({
      callbackData: 'fin:flow:archive-category:category-0',
      text: expect.stringContaining('Архівувати'),
    }));
  });

  it.each([[0, '2'], [1, '1']] as const)(
    'explains the missing account count and offers actions with %i accounts',
    async (count, missing) => {
      await responder.sendTransfer(context, 'user-1', 'profile-1', 'chat-1', 'en', count);
      const message = interactive.send.mock.calls[0][2];
      expect(message.text).toContain(missing);
      expect(message.inlineButtons.flat()).toEqual(expect.arrayContaining([
        expect.objectContaining({ callbackData: 'fin:flow:start-account' }),
        expect.objectContaining({ webAppUrl: expect.stringContaining('screen=accounts') }),
      ]));
    },
  );

  it.each([
    ['en', 'Primary currency'],
    ['uk', 'Основна валюта'],
    ['ru', 'Основная валюта'],
  ] as const)('renders useful %s settings with plan and full-settings actions', async (locale, wording) => {
    await responder.sendSettings(context, 'chat-1', locale, 'EUR');
    const message = interactive.send.mock.calls[0][2];
    expect(message.text).toContain(`${wording}: EUR`);
    expect(message.inlineButtons.flat()).toEqual(expect.arrayContaining([
      expect.objectContaining({ callbackData: 'fin:flow:start-language' }),
      expect.objectContaining({ webAppUrl: expect.stringContaining('/finance/finance-bot') }),
    ]));
  });
});
