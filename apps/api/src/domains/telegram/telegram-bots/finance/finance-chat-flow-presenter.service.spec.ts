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
    ['en', 'Review Expense', 'Account: Cash'],
    ['uk', 'Перевірте: Витрата', 'Рахунок: Cash'],
    ['ru', 'Проверьте: Расход', 'Счёт: Cash'],
  ] as const)('renders human transaction labels in %s without internal ids', async (locale, title, accountText) => {
    flows.reviewLabels.mockResolvedValue({
      accounts: [{ id: 'internal-account-id', name: 'Cash', currency: 'UAH', archivedAt: null }],
      category: { id: 'internal-category-id', name: 'Food', key: 'food', archivedAt: null },
    });
    const result = await presenter.present('profile', locale, {
      kind: 'review', flow: 'TRANSACTION_CREATE', step: 'TRANSACTION_REVIEW',
      payload: { type: 'EXPENSE', amount: '25', accountId: 'internal-account-id', categoryId: 'internal-category-id', description: 'Coffee' },
    });
    expect(result.text).toContain(title);
    expect(result.text).toContain(accountText);
    expect(result.text).not.toContain('internal-account-id');
    expect(result.text).not.toContain('categoryId');
  });

  it('keeps choice keyboards bounded and two-column', async () => {
    flows.choices.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({ id: `a-${index}`, label: `Account ${index}` })));
    const result = await presenter.present('profile', 'en', { kind: 'prompt', flow: 'TRANSACTION_CREATE', step: 'TRANSACTION_ACCOUNT', payload: { type: 'EXPENSE' } });
    const choiceRows = result.inlineButtons.slice(0, -1);
    expect(choiceRows.flat().filter((button) => button.callbackData.includes(':account:'))).toHaveLength(10);
    expect(choiceRows.flat()).toEqual(expect.arrayContaining([expect.objectContaining({ callbackData: 'fin:flow:page:1' })]));
    expect(choiceRows.every((row) => row.length <= 2)).toBe(true);
  });

  it('offers an actionable skip on the optional description step', async () => {
    const result = await presenter.present('profile', 'en', { kind: 'prompt', flow: 'TRANSACTION_CREATE', step: 'TRANSACTION_DESCRIPTION', payload: { type: 'INCOME' } });
    expect(result.text).toContain('Step 1 of 4');
    expect(result.inlineButtons.flat()).toEqual(expect.arrayContaining([expect.objectContaining({ callbackData: 'fin:flow:skip' }), expect.objectContaining({ callbackData: 'fin:flow:cancel' })]));
  });
});
