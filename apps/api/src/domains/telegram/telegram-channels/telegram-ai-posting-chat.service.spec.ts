import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramAiPostingChatService } from './telegram-ai-posting-chat.service';

describe('channel AI chat', () => {
  const channel = { findFirst: jest.fn() };
  const settings = { findFirst: jest.fn() };
  const hypotheses = { findMany: jest.fn() };
  const groups = { findMany: jest.fn() };
  const chatMessages = { findMany: jest.fn(), createMany: jest.fn() };
  const workspace = { resolveWorkspaceIdForUser: jest.fn() };
  const gateway = { execute: jest.fn() };
  const chatSources = { setup: jest.fn() };
  const testRuns = { reviewPublication: jest.fn() };
  const chatAttachments = { findMany: jest.fn() };
  const service = new TelegramAiPostingChatService({ telegramChannel: channel, telegramAiPostingSettings: settings, telegramContentHypothesis: hypotheses, postGroup: groups, telegramAiPostingChatMessage: chatMessages, telegramAiPostingChatAttachment: chatAttachments } as never, workspace as never, gateway as never, chatSources as never, testRuns as never);
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.resolveWorkspaceIdForUser.mockResolvedValue('workspace');
    channel.findFirst.mockResolvedValue({ title: 'Channel', language: 'uk', shortDescription: null });
    settings.findFirst.mockResolvedValue({ configuration: { channelDescription: 'Editorial', sources: [{ value: 'secret-source-url' }] }, aiMonthlyBudget: null });
    hypotheses.findMany.mockResolvedValue([]); groups.findMany.mockResolvedValue([]); chatMessages.findMany.mockResolvedValue([]); chatMessages.createMany.mockResolvedValue({ count: 2 });
    gateway.execute.mockResolvedValue({ operation: { status: 'SUCCEEDED' }, result: { reply: JSON.stringify({ reply: 'Давайте уточним тему.', setup: null, topic: null }) } });
  });
  it('uses channel-scoped context and returns the actual assistant response', async () => {
    await expect(service.reply('user', 'channel', [{ role: 'user', text: 'Хочу рубрику' }])).resolves.toEqual({ reply: 'Давайте уточним тему.\n\nНастройки канала не изменялись.', actions: [], suggestedTopic: null, revisedPublication: null });
    expect(chatMessages.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ role: 'user', text: 'Хочу рубрику' }), expect.objectContaining({ role: 'assistant', text: 'Давайте уточним тему.\n\nНастройки канала не изменялись.' })]) }));
    expect(channel.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'channel', workspaceId: 'workspace' } }));
    expect(gateway.execute.mock.calls[0][0].input).not.toContain('secret-source-url');
    expect(gateway.execute.mock.calls[0][0].instructions).toContain('Never invent');
  });
  it('executes a named company setup and reports only the actual result', async () => {
    gateway.execute.mockResolvedValueOnce({ operation: { status: 'SUCCEEDED' }, result: { reply: JSON.stringify({ reply: 'Проверю.', setup: { query: 'Нова пошта', rubric: 'Бизнес-кейсы' }, topic: 'История Новой почты' }) } });
    chatSources.setup.mockResolvedValueOnce({ source: { value: 'https://example.ua/', added: true, reEnabled: false }, rubric: { name: 'Бизнес-кейсы', added: true } });
    const result = await service.reply('user', 'channel', [{ role: 'user', text: 'Создай рубрику и источник для Нова пошта' }]);
    expect(result.actions[0]).toMatchObject({ status: 'completed', message: expect.stringContaining('https://example.ua/') });
    expect(result.suggestedTopic).toBe('История Новой почты — Нова пошта');
    expect(chatSources.setup).toHaveBeenCalledTimes(1);
  });
  it('never executes a company invented by the planner', async () => {
    gateway.execute.mockResolvedValueOnce({ operation: { status: 'SUCCEEDED' }, result: { reply: JSON.stringify({ reply: 'Готово', setup: { query: 'Несуществующая', rubric: 'Кейсы' }, topic: null }) } });
    const result = await service.reply('user', 'channel', [{ role: 'user', text: 'Хочу рубрику' }]);
    expect(result.actions[0].status).toBe('failed');
    expect(chatSources.setup).not.toHaveBeenCalled();
    expect(result.reply).not.toContain('Готово');
  });
  it('rejects attachments from another workspace or expired attachments', async () => {
    chatAttachments.findMany.mockResolvedValueOnce([]);
    await expect(service.reply('user', 'channel', [{ role: 'user', text: '' }], ['foreign-id'])).rejects.toBeInstanceOf(BadRequestException);
    expect(gateway.execute).not.toHaveBeenCalled();
    expect(chatAttachments.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'workspace', telegramChannelId: 'channel', actorUserId: 'user' }) }));
  });
  it('describes an attached image without editing a selected publication', async () => {
    chatAttachments.findMany.mockResolvedValueOnce([{ id: 'image', kind: 'image', name: 'image.png', content: 'Белый фон и надпись' }]);
    gateway.execute.mockResolvedValueOnce({ operation: { status: 'SUCCEEDED' }, result: { reply: JSON.stringify({ reply: 'Обновлю', setup: { query: 'Нова пошта', rubric: 'Кейсы' }, revision: 'image' }) } });
    const result = await service.reply('user', 'channel', [{ role: 'user', text: 'Опиши, что видно на изображении' }], ['image'], { runId: 'run', index: 0, version: 2 });
    expect(result.reply).toContain('Белый фон и надпись');
    expect(testRuns.reviewPublication).not.toHaveBeenCalled();
    expect(chatSources.setup).not.toHaveBeenCalled();
  });
  it('applies voice feedback to the selected publication using the saved transcript', async () => {
    chatAttachments.findMany.mockResolvedValueOnce([{ id: 'voice', kind: 'audio', name: 'voice.wav', content: 'Сократи текст' }]);
    gateway.execute.mockResolvedValueOnce({ operation: { status: 'SUCCEEDED' }, result: { reply: JSON.stringify({ reply: 'Изменю текст', setup: null, topic: null, revision: 'text' }) } });
    testRuns.reviewPublication.mockResolvedValueOnce({ version: 4, publications: [{ title: 'Title', text: 'Кратко', imageUrl: null }] });
    const result = await service.reply('user', 'channel', [{ role: 'user', text: '' }], ['voice'], { runId: 'run', index: 0, version: 3 });
    expect(testRuns.reviewPublication).toHaveBeenCalledWith('user', 'channel', 'run', 0, 3, 'regenerate-text', 'Сократи текст');
    expect(result.revisedPublication?.publication.text).toBe('Кратко');
    expect(result.actions[0].status).toBe('completed');
  });
  it('does not claim success when publication editing fails', async () => {
    gateway.execute.mockResolvedValueOnce({ operation: { status: 'SUCCEEDED' }, result: { reply: JSON.stringify({ reply: 'Готово', setup: null, revision: 'text' }) } });
    testRuns.reviewPublication.mockRejectedValueOnce(new Error('conflict'));
    const result = await service.reply('user', 'channel', [{ role: 'user', text: 'Сократи текст' }], [], { runId: 'run', index: 0, version: 2 });
    expect(result.actions[0].status).toBe('failed');
    expect(result.reply).not.toContain('Готово');
  });
  it('returns only the selected workspace and channel history in chronological order', async () => {
    chatMessages.findMany.mockResolvedValueOnce([{ role: 'assistant', text: 'Answer' }, { role: 'user', text: 'Question' }]);
    await expect(service.history('user', 'channel')).resolves.toEqual([{ role: 'user', text: 'Question' }, { role: 'assistant', text: 'Answer' }]);
    expect(chatMessages.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: 'workspace', telegramChannelId: 'channel' }, take: 100 }));
  });
  it('does not persist a failed provider response', async () => {
    gateway.execute.mockResolvedValueOnce({ operation: { status: 'FAILED' } });
    await expect(service.reply('user', 'channel', [{ role: 'user', text: 'Question' }])).rejects.toBeInstanceOf(BadGatewayException);
    expect(chatMessages.createMany).not.toHaveBeenCalled();
  });
  it('rejects invalid messages, inaccessible channels and failed operations', async () => {
    await expect(service.reply('user', 'channel', [{ role: 'assistant', text: 'wrong' }])).rejects.toBeInstanceOf(BadRequestException);
    channel.findFirst.mockResolvedValueOnce(null);
    await expect(service.reply('user', 'channel', [{ role: 'user', text: 'test' }])).rejects.toBeInstanceOf(NotFoundException);
    gateway.execute.mockResolvedValueOnce({ operation: { status: 'FAILED' } });
    await expect(service.reply('user', 'channel', [{ role: 'user', text: 'test' }])).rejects.toBeInstanceOf(BadGatewayException);
  });
});
