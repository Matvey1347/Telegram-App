import { parseTelegramAiPostingDraft } from './telegram-ai-posting-json';

describe('parseTelegramAiPostingDraft', () => {
  it('separates a plain-text headline from the generated post body', () => {
    expect(
      parseTelegramAiPostingDraft('A useful headline\n\nThe complete post body.'),
    ).toEqual({
      title: 'A useful headline',
      text: 'The complete post body.',
    });
  });

  it('continues to parse legacy JSON draft responses', () => {
    expect(
      parseTelegramAiPostingDraft(
        JSON.stringify({ title: 'A title', text: 'A complete post.' }),
      ),
    ).toEqual({ title: 'A title', text: 'A complete post.' });
  });

  it('accepts plain prose without a separate headline paragraph', () => {
    expect(parseTelegramAiPostingDraft('A complete post without a headline.')).toEqual({
      title: 'A complete post without a headline.',
      text: 'A complete post without a headline.',
    });
  });
});
