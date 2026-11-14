import { parseTelegramAiPostingChatPlan } from './telegram-ai-posting-chat-plan';

describe('AI Posting chat action plan', () => {
  it('accepts a bounded company setup and publication topic', () => {
    expect(parseTelegramAiPostingChatPlan(JSON.stringify({ reply: 'Проверю источник.', setup: { query: 'Компания', rubric: 'Бизнес-кейсы', entityId: 'Q42' }, topic: 'История компании' }))).toEqual({ reply: 'Проверю источник.', setup: { query: 'Компания', rubric: 'Бизнес-кейсы', entityId: 'Q42' }, topic: 'История компании', revision: null });
  });
  it('rejects invented action shapes, invalid entity ids and non-JSON text', () => {
    expect(parseTelegramAiPostingChatPlan(JSON.stringify({ reply: 'Хорошо', setup: { query: 'X', rubric: 'Y', entityId: 'https://example.com' } }))).toBeNull();
    expect(parseTelegramAiPostingChatPlan(JSON.stringify({ reply: 'Хорошо', setup: { query: 'X', rubric: '' } }))).toBeNull();
    expect(parseTelegramAiPostingChatPlan('Источник добавлен')).toBeNull();
  });
});
