import { FinanceChatFlowPresenterService } from './finance-chat-flow-presenter.service';

describe('FinanceChatFlowPresenterService', () => {
  const flows = {
    currencyKeyboard: jest.fn(),
    choices: jest.fn(),
    reviewLabels: jest.fn(),
  };
  const presenter = new FinanceChatFlowPresenterService(flows as never);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['en', 'Review Expense', 'Account: 💰 Cash'],
    ['uk', 'Перевірте: Витрата', 'Рахунок: 💰 Cash'],
    ['ru', 'Проверьте: Расход', 'Счёт: 💰 Cash'],
  ] as const)(
    'renders human transaction labels in %s without internal ids',
    async (locale, title, accountText) => {
      const result = await presenter.present('profile', locale, {
        kind: 'review',
        flow: 'TRANSACTION_CREATE',
        step: 'TRANSACTION_REVIEW',
        payload: {
          type: 'EXPENSE',
          amount: '25',
          accountId: 'internal-account-id',
          accountName: 'Cash',
          accountCurrency: 'UAH',
          categoryId: 'internal-category-id',
          categoryName: 'Food',
          categoryKey: 'food',
          description: 'Coffee',
        },
      });
      expect(result.text).toContain(title);
      expect(result.text).toContain(accountText);
      expect(result.text).not.toContain('internal-account-id');
      expect(result.text).not.toContain('categoryId');
      expect(flows.reviewLabels).not.toHaveBeenCalled();
    },
  );

  it('keeps choice keyboards bounded and two-column', async () => {
    flows.choices.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) => ({
        id: `a-${index}`,
        label: `Account ${index}`,
      })),
    );
    const result = await presenter.present('profile', 'en', {
      kind: 'prompt',
      flow: 'TRANSACTION_CREATE',
      step: 'TRANSACTION_ACCOUNT',
      payload: { type: 'EXPENSE' },
    });
    const choiceRows = result.inlineButtons.slice(0, -1);
    expect(
      choiceRows
        .flat()
        .filter((button) => button.callbackData.includes(':account:')),
    ).toHaveLength(10);
    expect(choiceRows.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callbackData: 'fin:flow:page:1' }),
      ]),
    );
    expect(choiceRows.every((row) => row.length <= 2)).toBe(true);
  });

  it('keeps localized category choices paginated and bounded', async () => {
    flows.choices.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => ({
        id: `c-${index}`,
        label: index === 0 ? 'Food' : `Category ${index}`,
        key: index === 0 ? 'food' : null,
      })),
    );
    const result = await presenter.present('profile', 'uk', {
      kind: 'prompt',
      flow: 'TRANSACTION_CREATE',
      step: 'TRANSACTION_CATEGORY',
      payload: { type: 'EXPENSE', revision: 'rev-1' },
    });
    const buttons = result.inlineButtons.flat();
    expect(
      buttons.filter((button) => button.callbackData.includes(':category:')),
    ).toHaveLength(10);
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: '🍽️ Їжа' }),
        expect.objectContaining({ callbackData: 'fin:flow:page:rev-1.1' }),
      ]),
    );
    expect(
      buttons.some((button) => button.callbackData.includes(':skip:')),
    ).toBe(false);
    expect(result.text).toContain('Крок 2 із 4');
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callbackData: 'fin:flow:back:rev-1' }),
      ]),
    );
  });

  it('offers an actionable skip on the optional description step', async () => {
    const result = await presenter.present('profile', 'en', {
      kind: 'prompt',
      flow: 'TRANSACTION_CREATE',
      step: 'TRANSACTION_DESCRIPTION',
      payload: { type: 'INCOME' },
    });
    expect(result.text).toContain('Step 4 of 4');
    expect(result.inlineButtons.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callbackData: 'fin:flow:skip' }),
        expect.objectContaining({ callbackData: 'fin:flow:cancel' }),
      ]),
    );
  });

  it.each([
    ['en', 'Account: Cash · USD'],
    ['uk', 'Рахунок: Cash · USD'],
    ['ru', 'Счёт: Cash · USD'],
  ] as const)(
    'shows the selected account and currency in the %s amount prompt',
    async (locale, text) => {
      const result = await presenter.present('profile', locale, {
        kind: 'prompt',
        flow: 'TRANSACTION_CREATE',
        step: 'TRANSACTION_AMOUNT',
        payload: {
          type: 'INCOME',
          accountId: 'a-1',
          accountName: 'Cash',
          accountCurrency: 'USD',
        },
      });
      expect(result.text).toContain(text);
      expect(result.text).toMatch(/(?:Step|Крок|Шаг) 3 (?:of|із|из) 4/);
    },
  );
});
