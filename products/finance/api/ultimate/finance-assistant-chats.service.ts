import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@api/prisma/prisma.service';
import type {
  ConsumerFinanceAssistantChat,
  ConsumerFinanceAssistantChatMode,
  ConsumerFinanceAssistantMessage,
  ConsumerFinanceAssistantMessageInput,
  ConsumerFinanceAssistantMessageResult,
  ConsumerFinanceAssistantPage,
  ConsumerFinanceAssistantTurn,
} from '@telegram-system/shared';

type Identity = { profileId: string; botIntegrationId: string; telegramBotUserId: string };
const chatSelect = { id: true, title: true, mode: true, updatedAt: true, archivedAt: true } as const;
const pageSize = 30;

function profileScope(identity: Identity) {
  return { id: identity.profileId, botIntegrationId: identity.botIntegrationId, telegramBotUserId: identity.telegramBotUserId };
}

function serializeChat(chat: Omit<ConsumerFinanceAssistantChat, 'updatedAt' | 'archivedAt'> & { updatedAt: Date; archivedAt?: Date | null }): ConsumerFinanceAssistantChat {
  return { ...chat, updatedAt: chat.updatedAt.toISOString(), archivedAt: chat.archivedAt?.toISOString() ?? null };
}

function chatTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) throw new BadRequestException('Chat title is required');
  return trimmed;
}

@Injectable()
export class FinanceAssistantChatsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(identity: Identity, cursor?: string, archived = false): Promise<ConsumerFinanceAssistantPage<ConsumerFinanceAssistantChat>> {
    const where = { profile: profileScope(identity), archivedAt: archived ? { not: null } : null };
    if (cursor) {
      const anchor = await this.get(identity, cursor);
      if (Boolean(anchor.archivedAt) !== archived) throw new NotFoundException('Chat not found');
    }
    const rows = await this.prisma.financeAssistantChat.findMany({
      where, select: chatSelect, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1, ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    const items = rows.slice(0, pageSize).map(serializeChat);
    return { items, nextCursor: rows.length > pageSize ? items.at(-1)!.id : null };
  }

  async get(identity: Identity, id: string) {
    const chat = await this.prisma.financeAssistantChat.findFirst({
      where: { id, profile: profileScope(identity) }, select: chatSelect,
    });
    if (!chat) throw new NotFoundException('Chat not found');
    return serializeChat(chat);
  }

  async create(identity: Identity, title: string, mode: ConsumerFinanceAssistantChatMode, chatId?: string) {
    const scope = profileScope(identity);
    const data = { title: chatTitle(title), mode, profile: { connect: scope } };
    if (!chatId) {
      return serializeChat(await this.prisma.financeAssistantChat.create({ data, select: chatSelect }));
    }
    return serializeChat(await this.prisma.financeAssistantChat.upsert({
      where: { id: chatId, profile: scope },
      create: { id: chatId, ...data },
      update: {},
      select: chatSelect,
    }));
  }

  async rename(identity: Identity, id: string, title: string) {
    const updated = await this.prisma.financeAssistantChat.updateMany({
      where: { id, profile: profileScope(identity) }, data: { title: chatTitle(title) },
    });
    if (!updated.count) throw new NotFoundException('Chat not found');
    return this.get(identity, id);
  }

  async move(identity: Identity, id: string, archived: boolean) {
    await this.prisma.financeAssistantChat.updateMany({
      where: { id, profile: profileScope(identity), archivedAt: archived ? null : { not: null } },
      data: { archivedAt: archived ? new Date() : null },
    });
    return this.get(identity, id);
  }

  async remove(identity: Identity, id: string) {
    const deleted = await this.prisma.financeAssistantChat.deleteMany({
      where: { id, profile: profileScope(identity) },
    });
    if (!deleted.count) throw new NotFoundException('Chat not found');
  }

  async turns(identity: Identity, chatId: string, cursor?: string): Promise<ConsumerFinanceAssistantPage<ConsumerFinanceAssistantTurn>> {
    await this.get(identity, chatId);
    const rows = await this.prisma.financeAssistantTurn.findMany({
      where: { chatId },
      select: { requestId: true, userText: true, assistantText: true, replyTo: true },
      orderBy: [{ createdAt: 'desc' }, { requestId: 'desc' }],
      take: pageSize + 1, ...(cursor && { cursor: { chatId_requestId: { chatId, requestId: cursor } }, skip: 1 }),
    });
    const items = rows.slice(0, pageSize).map(({ requestId, userText, assistantText, replyTo }) => ({
      id: requestId, userText, assistantText, replyTo: replyTo as ConsumerFinanceAssistantMessage | null,
    }));
    return { items, nextCursor: rows.length > pageSize ? items.at(-1)!.id : null };
  }

  async run(
    identity: Identity,
    input: ConsumerFinanceAssistantMessageInput,
    respond: (history: ConsumerFinanceAssistantMessage[], mode: ConsumerFinanceAssistantChatMode) => Promise<ConsumerFinanceAssistantMessageResult>,
    options: { signal?: AbortSignal; attachment?: boolean; partialText?: () => string } = {},
  ) {
    const { chatId, turnId } = input;
    if (!chatId || !turnId) throw new BadRequestException('Chat and turn are required');
    const chat = await this.get(identity, chatId);
    if (options.attachment && chat.mode === 'ADVICE') throw new BadRequestException('Advice chats accept text only');
    options.signal?.throwIfAborted();
    const where = { chatId, requestId: turnId };
    const key = { chatId_requestId: where };
    const created = await this.prisma.$transaction(async (transaction) => {
      const inserted = await transaction.financeAssistantTurn.createMany({
        data: { ...where, userText: input.text, ...(input.replyTo && { replyTo: input.replyTo }) },
        skipDuplicates: true,
      });
      if (inserted.count) {
        await transaction.financeAssistantChat.update({ where: { id: chatId }, data: { updatedAt: new Date() } });
      }
      return inserted.count > 0;
    });

    let attempt = 1;
    const turn = await this.prisma.financeAssistantTurn.findUniqueOrThrow({ where: key });
    if (!created) {
      const quote = turn.replyTo as ConsumerFinanceAssistantMessage | null;
      if (turn.userText !== input.text || quote?.text !== input.replyTo?.text || quote?.role !== input.replyTo?.role)
        throw new ConflictException('Turn already exists');
      if (turn.status === 'COMPLETE' && turn.result)
        return turn.result as ConsumerFinanceAssistantMessageResult;
      const claimed = await this.prisma.financeAssistantTurn.updateMany({
        where: { ...where, attempt: turn.attempt, OR: [
          { status: 'FAILED' },
          { status: 'PENDING', updatedAt: { lt: new Date(Date.now() - 120_000) } },
        ] },
        data: { status: 'PENDING', attempt: { increment: 1 }, assistantText: null },
      });
      if (!claimed.count) throw new ConflictException('Turn is already running');
      attempt = turn.attempt + 1;
    }
    const claim = { ...where, attempt, status: 'PENDING' };
    try {
      const previous = options.attachment ? [] : await this.prisma.financeAssistantTurn.findMany({
        where: { chatId, status: 'COMPLETE', OR: [
          { createdAt: { lt: turn.createdAt } },
          { createdAt: turn.createdAt, requestId: { lt: turnId } },
        ] },
        select: { userText: true, assistantText: true },
        orderBy: [{ createdAt: 'desc' }, { requestId: 'desc' }], take: 4,
      });
      const history = previous.reverse().flatMap<ConsumerFinanceAssistantMessage>((item) => [
        { role: 'user', text: item.userText.slice(0, 1200) },
        ...(item.assistantText ? [{ role: 'assistant' as const, text: item.assistantText.slice(0, 1200) }] : []),
      ]);
      options.signal?.throwIfAborted();
      const result = await respond(history, chat.mode);
      options.signal?.throwIfAborted();
      const finished = await this.prisma.financeAssistantTurn.updateMany({
        where: claim,
        data: { assistantText: result.message, result, status: 'COMPLETE' },
      });
      if (!finished.count) throw new ConflictException('Turn is already running');
      return result;
    } catch (error) {
      await this.prisma.financeAssistantTurn.updateMany({
        where: claim,
        data: { status: 'FAILED', assistantText: options.signal?.aborted ? options.partialText?.() || null : null },
      });
      throw error;
    }
  }
}
