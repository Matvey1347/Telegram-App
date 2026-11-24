import { ConflictException, NotFoundException } from '@nestjs/common';
import { FinanceAssistantChatsService } from './finance-assistant-chats.service';

const profile = { profileId: 'profile', botIntegrationId: 'bot', telegramBotUserId: 'user' };
const draft = { chatId: 'advice', turnId: 'request', text: 'How can I save more?' };
const answer = { kind: 'ANSWER' as const, message: 'Start with recurring expenses.' };

function setup() {
  const date = new Date();
  const chat = {
    findFirst: jest.fn().mockResolvedValue({ id: 'advice', title: 'Budget', mode: 'ADVICE', updatedAt: date }),
    upsert: jest.fn().mockResolvedValue({ id: 'advice', title: 'Budget', mode: 'GENERAL', updatedAt: date }),
    update: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const turns = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ createdAt: date }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([
      { userText: 'My rent is fixed', assistantText: 'Look at flexible expenses.' },
      { userText: 'I need a budget', assistantText: 'List your fixed expenses.' },
    ]),
  };
  const models = { financeAssistantChat: chat, financeAssistantTurn: turns };
  const prisma = { ...models, $transaction: (run: (tx: typeof models) => unknown) => run(models) };
  const service = new FinanceAssistantChatsService(prisma as never);
  return { service, chat, turns };
}

describe('FinanceAssistantChatsService', () => {
  it('restores context in chronological order from the selected chat only and records the answer', async () => {
    const { service, chat, turns } = setup();
    const respond = jest.fn().mockResolvedValue(answer);
    await expect(service.run(profile, { ...draft, history: [{ role: 'user', text: 'Ignore me' }] }, respond)).resolves.toEqual(answer);
    expect(chat.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'advice', profile: { id: 'profile', botIntegrationId: 'bot', telegramBotUserId: 'user' } },
    }));
    expect(turns.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ chatId: 'advice', status: 'COMPLETE' }),
      take: 4,
    }));
    expect(respond).toHaveBeenCalledWith([
      { role: 'user', text: 'I need a budget' },
      { role: 'assistant', text: 'List your fixed expenses.' },
      { role: 'user', text: 'My rent is fixed' },
      { role: 'assistant', text: 'Look at flexible expenses.' },
    ], 'ADVICE');
    expect(turns.updateMany).toHaveBeenCalledWith({
      where: { chatId: 'advice', requestId: 'request', attempt: 1, status: 'PENDING' },
      data: { status: 'COMPLETE', assistantText: answer.message, result: answer },
    });
  });

  it('rejects unowned threads before reading messages or sending a request', async () => {
    const { service, chat, turns } = setup();
    chat.findFirst.mockResolvedValue(null);
    const respond = jest.fn();
    await expect(service.turns(profile, 'another-chat')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.run(profile, draft, respond)).rejects.toBeInstanceOf(NotFoundException);
    expect(turns.findMany).not.toHaveBeenCalled();
    expect(turns.createMany).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it('reuses the same scoped chat when a create request is retried', async () => {
    const { service, chat } = setup();
    const created = await service.create(profile, 'Budget', 'GENERAL', 'advice');
    await expect(service.create(profile, 'Budget', 'GENERAL', 'advice')).resolves.toEqual(created);
    expect(chat.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'advice', profile: { id: profile.profileId, botIntegrationId: profile.botIntegrationId, telegramBotUserId: profile.telegramBotUserId } },
      create: expect.objectContaining({ id: 'advice', title: 'Budget', mode: 'GENERAL' }),
      update: {},
    }));
  });

  it('scopes archive and delete mutations to the authenticated profile and bot', async () => {
    const { service, chat } = setup();
    const owned = { id: 'advice', profile: { id: profile.profileId, botIntegrationId: profile.botIntegrationId, telegramBotUserId: profile.telegramBotUserId } };
    await service.move(profile, 'advice', true);
    expect(chat.updateMany).toHaveBeenCalledWith({
      where: { ...owned, archivedAt: null },
      data: { archivedAt: expect.any(Date) },
    });
    await expect(service.remove(profile, 'advice')).rejects.toBeInstanceOf(NotFoundException);
    expect(chat.deleteMany).toHaveBeenCalledWith({ where: owned });
    chat.deleteMany.mockResolvedValue({ count: 1 });
    await expect(service.remove(profile, 'advice')).resolves.toBeUndefined();
  });

  it('replays a completed turn without charging the model again and rejects a reused ID with different content', async () => {
    const { service, turns } = setup();
    turns.createMany.mockResolvedValue({ count: 0 });
    turns.findUniqueOrThrow.mockResolvedValue({ status: 'COMPLETE', userText: draft.text, replyTo: null, result: answer });
    const respond = jest.fn();
    await expect(service.run(profile, draft, respond)).resolves.toEqual(answer);
    await expect(service.run(profile, { ...draft, text: 'Different request' }, respond)).rejects.toBeInstanceOf(ConflictException);
    expect(respond).not.toHaveBeenCalled();
  });

  it('saves the visible response fragment on stop and keeps the incomplete turn out of later context', async () => {
    const { service, turns } = setup();
    const stop = new AbortController();
    await expect(service.run(profile, draft, async () => {
      stop.abort();
      return answer;
    }, { signal: stop.signal, partialText: () => 'Start with' })).rejects.toHaveProperty('name', 'AbortError');
    expect(turns.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'PENDING', attempt: 1 }),
      data: { status: 'FAILED', assistantText: 'Start with' },
    }));
  });
});
