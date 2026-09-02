import { translateBackend } from './backend-translator';

describe('translateBackend', () => {
  const catalog = {
    en: { greeting: 'Hello, {name}' },
    ru: { greeting: 'Привет, {name}' },
  } as const;

  it('normalizes regional locales and interpolates parameters', () => {
    expect(
      translateBackend(catalog, 'ru-RU', 'greeting', { name: 'Ольга' }),
    ).toBe('Привет, Ольга');
  });

  it('falls back to English for unsupported locales', () => {
    expect(translateBackend(catalog, 'de', 'greeting', { name: 'Max' })).toBe(
      'Hello, Max',
    );
  });
});
