import { telegramAiPostingLanguageName } from './telegram-ai-posting-language';

describe('telegramAiPostingLanguageName', () => {
  it('turns language codes into explicit language names for prompts', () => {
    expect(telegramAiPostingLanguageName('uk')).toBe('Ukrainian (Українська)');
    expect(telegramAiPostingLanguageName('uk-UA')).toBe(
      'Ukrainian (Українська)',
    );
    expect(telegramAiPostingLanguageName('ru')).toBe('Russian (Русский)');
  });

  it('keeps a non-empty language label and handles an absent language', () => {
    expect(telegramAiPostingLanguageName('Português')).toBe('Português');
    expect(telegramAiPostingLanguageName('  ')).toBe('');
    expect(telegramAiPostingLanguageName('auto')).toBe('');
  });
});
