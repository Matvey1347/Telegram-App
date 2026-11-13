import {
  editorialDescription,
  mandatoryChannelRules,
  publicationEmojiInstruction,
} from './telegram-ai-posting-prompts';

describe('AI posting prompt context', () => {
  it('includes an active feedback rule in the mandatory prompt block', () => {
    expect(
      mandatoryChannelRules({
        rules: [
          {
            id: 'r1',
            text: 'Use practical examples',
            source: 'feedback',
            active: true,
            createdAt: '2026-01-01',
          },
        ],
      }),
    ).toContain('1. Use practical examples');
  });

  it('includes style and legacy fields even when a channel description exists', () => {
    expect(
      editorialDescription({
        channelDescription: 'A technology channel',
        style: 'Warm and concise',
        topic: 'Engineering',
      }),
    ).toContain('Стиль: Warm and concise');
    expect(
      editorialDescription({
        channelDescription: 'A technology channel',
        style: 'Warm and concise',
      }),
    ).toContain('Описание канала: A technology channel');
  });

  it('asks for relevant emojis throughout the text when contextual mode is selected', () => {
    expect(
      publicationEmojiInstruction({ emojiPolicy: 'contextual' }),
    ).toContain(
      'Use 2–3 relevant emojis in a normal-length post, distributed through its body',
    );
    expect(publicationEmojiInstruction({ emojiPolicy: 'start' })).toContain(
      'exactly one relevant emoji at the very beginning',
    );
  });
});
