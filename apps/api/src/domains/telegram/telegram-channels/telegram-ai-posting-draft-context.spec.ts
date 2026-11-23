import { telegramAiPostingDraftContext } from './telegram-ai-posting-draft-context';

describe('AI Posting compact draft context', () => {
  it('keeps editorial requirements and source links while bounding repeated examples and metadata', () => {
    const sample = 'Ukrainian channel sample '.repeat(1000);
    const context = telegramAiPostingDraftContext(
      {
        audience: sample,
        learningBlock: `ЧТО РАБОТАЕТ\n\nЛучшие посты:\n${sample}\n\nАнтипримеры:\n${sample}\n\nРазбивка: short`,
        rules: [{ active: true, text: 'Include a concrete example' }],
        editorialSelection: {
          sphere: { name: 'Culture', description: sample, sources: [sample] },
          rubric: { name: 'Advice', goal: 'Give one useful next step' },
          lengths: [{ name: 'Short', minCharacters: 100, maxCharacters: 500 }],
        },
      },
      {
        history: Array.from({ length: 30 }, () => ({ text: sample })),
        existingPosts: Array.from({ length: 30 }, () => ({ title: sample })),
        sourceContexts: Array.from(
          { length: 10 },
          () => `https://example.test/article ${sample}`,
        ),
      } as never,
    );
    expect(context.guidance).toContain('Include a concrete example');
    expect(context.editorial).toContain('Give one useful next step');
    expect(context.editorial).toContain('Short 100–500');
    expect(context.evidence).toContain('https://example.test/article');
    expect(context.learning).toContain('Разбивка: short');
    expect(JSON.stringify(context).length).toBeLessThan(5500);
    expect(context.learning).not.toContain('Антипримеры');
  });
});
