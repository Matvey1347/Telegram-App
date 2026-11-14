import { applyTelegramAiPostingTestRunFormatting, preserveTelegramAiPostingReferences } from './telegram-ai-posting-test-run-format';

describe('AI posting edited text formatting', () => {
  it('preserves source links and configured tags when a revision omits them', () => {
    const config = { ending: 'Канал', hashtags: 'ending_inline' };
    const original = 'Новость [Источник](https://example.org/news)\n\nКанал | #бизнес';
    const revised = preserveTelegramAiPostingReferences('Коротко', original, config);
    expect(applyTelegramAiPostingTestRunFormatting(revised, config)).toBe('Коротко\n\n[Источник](https://example.org/news)\n\nКанал | #бизнес');
    expect(preserveTelegramAiPostingReferences('Коротко', original, config, 'Убери ссылку и хэштег')).toBe('Коротко');
  });
  it('keeps the ending and a single inline hashtag when formatting again', () => {
    const config = { ending: '**Канал** ![🍃](tg://emoji?id=42)', hashtags: 'ending_inline' };
    const result = `Текст\n\n${config.ending} | #тема`;
    expect(applyTelegramAiPostingTestRunFormatting(`${result} #другое`, config)).toBe(result);
    expect(applyTelegramAiPostingTestRunFormatting(result, config)).toBe(result);
  });

  it('places a tag on its own when no ending is configured', () => {
    expect(applyTelegramAiPostingTestRunFormatting('Текст #тема #новости', { hashtags: 'ending_inline' })).toBe('Текст\n\n#тема');
  });
});
