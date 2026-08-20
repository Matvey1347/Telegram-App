import { financeChatLocale, financeChatTranslations, normalizeFinanceLocale } from './finance-chat-i18n';

describe('Finance chat locale', () => {
  it.each([['uk-UA', 'uk'], ['ru_RU', 'ru'], ['en-US', 'en'], ['de-DE', 'en']])(
    'normalizes %s', (input, expected) => expect(normalizeFinanceLocale(input)).toBe(expected),
  );

  it('lets explicit Finance profile locale override Telegram language', () => {
    expect(financeChatLocale('ru', 'uk-UA')).toBe('ru');
    expect(financeChatLocale(null, 'uk-UA')).toBe('uk');
  });

  it('keeps all translations structurally in parity', () => {
    const expected = Object.keys(financeChatTranslations.en).sort();
    for (const locale of ['uk', 'ru'] as const) {
      expect(Object.keys(financeChatTranslations[locale]).sort()).toEqual(expected);
    }
  });

  it('defines every active Ukrainian and Russian value directly without English fallbacks', () => {
    const keys = Object.keys(financeChatTranslations.en) as Array<keyof typeof financeChatTranslations.en>;
    for (const locale of ['uk', 'ru'] as const) {
      for (const key of keys) {
        expect(Object.hasOwn(financeChatTranslations[locale], key)).toBe(true);
        if (key === 'notProvided' || key === 'zeroBalance') continue;
        expect(financeChatTranslations[locale][key]).not.toBe(financeChatTranslations.en[key]);
      }
    }
  });

  it('uses Ukrainian and Russian wording in high-visibility chat content', () => {
    expect(financeChatTranslations.uk.welcome).toContain('Вітаємо');
    expect(financeChatTranslations.uk.receiptProposal).toBe('Пропозиція з чека');
    expect(financeChatTranslations.ru.welcome).toContain('Добро пожаловать');
    expect(financeChatTranslations.ru.receiptProposal).toBe('Предложение из чека');
  });
});
