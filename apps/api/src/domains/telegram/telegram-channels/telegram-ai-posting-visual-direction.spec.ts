import {
  buildTelegramAiPostingImagePrompt,
  readTelegramAiPostingVisualDirection,
  telegramAiPostingVisualDirection,
  telegramAiPostingVisualReview,
  telegramAiPostingVisualMotif,
} from './telegram-ai-posting-visual-direction';

describe('AI Posting visual directions', () => {
  it.each([0, 3, 17])('assigns two of every form across ten slots at offset %i', (offset) => {
    const directions = Array.from({ length: 10 }, (_, index) =>
      telegramAiPostingVisualDirection(index + offset),
    );
    expect(new Set(directions).size).toBe(5);
    expect(directions.slice(0, 5)).toEqual(directions.slice(5));
    expect(directions.filter((form) => form === 'documentary')).toHaveLength(2);
  });

  it('varies the composition between both appearances of a form', () => {
    expect(telegramAiPostingVisualMotif('landscape', 2)).toContain('natural outdoor landscape');
    expect(telegramAiPostingVisualMotif('landscape', 7)).toContain('built environment');
  });

  it('keeps quote attribution separate from a landscape illustration and rejects polished stock imagery', () => {
    const prompt = buildTelegramAiPostingImagePrompt({
      topic: 'A quotation by a historical writer',
      prompt: 'A marshy river at dusk',
      visualDirection: 'landscape',
      channelTitle: 'Жіноча сила🍃',
    }, false);
    expect(prompt).toContain('A marshy river at dusk');
    expect(prompt).toContain('no foreground people');
    expect(prompt).toContain('image-generator gloss');
    expect(telegramAiPostingVisualReview('landscape')).toContain('not a request for a portrait');
    expect(readTelegramAiPostingVisualDirection('unexpected')).toBeUndefined();
  });
});
