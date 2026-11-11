import {
  renderTelegramAiPostingText,
  validateTelegramAiPostingCaption,
} from './telegram-ai-posting-render';

describe('Telegram AI posting renderer', () => {
  it('converts model markdown into deterministic editor formatting', () => {
    const result = renderTelegramAiPostingText('**Жирный** и _курсив_', {});
    expect(result).toBe('**Жирный** и __курсив__');
    expect(result).not.toMatch(/<\/?[a-z][^>]*>/i);
  });

  it('adds a configured ending exactly once when the model omitted or included it', () => {
    const ending = '[Подписаться](https://t.me/example)';
    for (const text of ['Полезный текст', `Полезный текст\n\n${ending}`]) {
      const result = renderTelegramAiPostingText(text, { ending });
      expect(result.match(/Подписаться/g)).toHaveLength(1);
      expect(
        validateTelegramAiPostingCaption(result, ending).errors,
      ).not.toContain('ending');
    }
    expect(
      renderTelegramAiPostingText('**Текст**\n\nПодписаться', {
        ending: 'Подписаться',
      }),
    ).toBe('**Текст**\n\nПодписаться');
  });

  it('converts quote lines with the existing editor quote syntax', () => {
    expect(
      renderTelegramAiPostingText('> Первая строка\n> Вторая строка', {}),
    ).toBe('> Первая строка\n> Вторая строка');
  });

  it('cleans unsupported HTML and markdown and validates empty and overlong captions', () => {
    const result = renderTelegramAiPostingText(
      '<script>alert(1)</script> ## Заголовок\n\n- **Текст** ~~зачёркнут~~',
      {},
    );
    expect(result).toBe('alert(1) Заголовок\n\n**Текст** зачёркнут');
    expect(validateTelegramAiPostingCaption('', '').errors).toContain('empty');
    expect(
      validateTelegramAiPostingCaption('a'.repeat(4), '', 3).errors,
    ).toContain('length');
  });

  it('places extracted hashtags according to configuration', () => {
    expect(
      renderTelegramAiPostingText('Текст #правило', { hashtags: 'end' }),
    ).toBe('Текст\n\n#правило');
  });

  it('keeps numeric hash tokens in the sentence and extracts only letter hashtags', () => {
    expect(
      renderTelegramAiPostingText(
        'Версия #1 вышла в #2024 году, #релиз_2 готов.',
        {
          hashtags: 'end',
        },
      ),
    ).toBe('Версия #1 вышла в #2024 году, готов.\n\n#релиз_2');
  });

  it('preserves configured editor markup byte-for-byte', () => {
    const ending =
      '__курсив__ ++подчёркивание++ ![x](tg://emoji?id=42) [ссылка](https://t.me/example)';
    expect(renderTelegramAiPostingText('Текст', { ending })).toBe(
      `Текст\n\n${ending}`,
    );
  });

  it('detects a model ending duplicate by visible text', () => {
    const ending = '__курсив__ ++подчёркивание++';
    expect(
      renderTelegramAiPostingText('Текст\n\n_курсив_ подчёркивание', {
        ending,
      }),
    ).toBe(`Текст\n\n${ending}`);
  });

  it('does not extract a hash from a link URL fragment', () => {
    expect(
      renderTelegramAiPostingText(
        'Откройте [раздел](https://example.com/page#topic) #новости',
        { hashtags: 'end' },
      ),
    ).toBe('Откройте [раздел](https://example.com/page#topic)\n\n#новости');
  });
});
