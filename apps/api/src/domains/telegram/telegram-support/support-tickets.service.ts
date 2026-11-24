import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SupportBotView, SupportProduct } from '@telegram-system/shared';
import { filter, Subject } from 'rxjs';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient, TelegramBotApiError } from '../../../telegram/shared/bot/telegram-bot-api.client';
import { telegramMarkupToHtml } from '../../../telegram/shared/markup/telegram-markup';
import { sendTelegramCustomEmojiHtml } from '../../../telegram/shared/bot/telegram-custom-emoji-html-send';
import { SUPPORT_PRODUCTS, SupportBotsService } from './support-bots.service';

const ticketSelect = {
  id: true,
  workspaceId: true,
  product: true,
  senderName: true,
  username: true,
  preview: true,
  needsReply: true,
  closedAt: true,
  updatedAt: true,
} satisfies Prisma.TelegramSupportTicketSelect;

const messageSelect = {
  id: true,
  text: true,
  status: true,
  automatic: true,
  formatted: true,
  replyId: true,
  telegramMessageId: true,
  replyToTelegramId: true,
  editedAt: true,
  deletedAt: true,
  reactions: true,
  createdAt: true,
} satisfies Prisma.TelegramSupportMessageSelect;

export type SupportUpdate = {
  update_id?: number;
  message_reaction?: {
    chat?: { id?: number; type?: string };
    user?: { id?: number; is_bot?: boolean };
    message_id?: number;
    date?: number;
    new_reaction?: Array<{ type?: string; emoji?: string; custom_emoji_id?: string }>;
  };
  message?: {
    date?: number;
    message_id?: number;
    reply_to_message?: { message_id?: number };
    chat?: { id?: number; type?: string };
    from?: {
      id?: number;
      is_bot?: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    text?: string;
    caption?: string;
  };
};

function telegramMessageId(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) &&
    value > 0 && value <= 2_147_483_647 ? value : undefined;
}

function avatarContentType(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

@Injectable()
export class SupportTicketsService {
  private readonly changes = new Subject<string>();

  constructor(
    private readonly db: PrismaService,
    private readonly bots: SupportBotsService,
    private readonly telegram: TelegramBotApiClient,
  ) {}

  events(workspaceId: string) {
    return this.changes.pipe(filter((scope) => scope === workspaceId));
  }

  private visibleProducts(workspaceId: string) {
    return SUPPORT_PRODUCTS.filter(
      (product) => this.bots.metadata(product).workspaceId === workspaceId,
    );
  }

  async summary(workspaceId: string): Promise<SupportBotView[]> {
    const products = this.visibleProducts(workspaceId);
    if (!products.length) return [];
    const groups = await this.db.telegramSupportTicket.groupBy({
      by: ['product', 'needsReply'],
      where: { workspaceId, closedAt: null, product: { in: products } },
      _count: { _all: true },
    });
    return products.map((product) => {
      const rows = groups.filter((group) => group.product === product);
      return {
        product,
        username: this.bots.metadata(product).username,
        configured: Boolean(this.bots.resolve(product)),
        open: rows.reduce((total, row) => total + row._count._all, 0),
        needsReply: rows.find((row) => row.needsReply)?._count._all ?? 0,
      };
    });
  }

  async list(
    workspaceId: string,
    closed: boolean,
    product?: SupportProduct,
    cursor?: string,
  ) {
    const products = this.visibleProducts(workspaceId).filter(
      (item) => !product || item === product,
    );
    const where: Prisma.TelegramSupportTicketWhereInput = {
      workspaceId,
      product: { in: products },
      closedAt: closed ? { not: null } : null,
    };
    const anchor =
      cursor &&
      (await this.db.telegramSupportTicket.findFirst({
        where: { ...where, id: cursor },
        select: { id: true, updatedAt: true },
      }));
    const rows = await this.db.telegramSupportTicket.findMany({
      where: {
        ...where,
        ...(anchor
          ? {
              OR: [
                { updatedAt: { lt: anchor.updatedAt } },
                { updatedAt: anchor.updatedAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 31,
      select: ticketSelect,
    });
    const items = rows.slice(0, 30);
    return {
      items,
      nextCursor: rows.length > 30 ? (items.at(-1)?.id ?? null) : null,
    };
  }

  private async ticket(workspaceId: string, id: string) {
    const ticket = await this.db.telegramSupportTicket.findFirst({
      where: {
        workspaceId,
        id,
        product: { in: this.visibleProducts(workspaceId) },
      },
    });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  async avatar(workspaceId: string, id: string, kind: 'sender' | 'bot') {
    const ticket = await this.ticket(workspaceId, id);
    const bot = this.bots.resolve(ticket.product);
    if (!bot || bot.workspaceId !== workspaceId || (ticket.botId && bot.botId !== ticket.botId))
      return null;

    try {
      const userId = kind === 'sender' ? ticket.chatId : bot.botId;
      const profile = await this.telegram.getUserProfilePhotos(bot.token, userId).catch(() => null);
      const fileId = profile?.photos?.[0]?.[0]?.file_id ??
        (kind === 'sender' ? (await this.telegram.getChat(bot.token, userId)).photo?.small_file_id : undefined);
      if (!fileId) return null;

      const { file_path: path } = await this.telegram.getFile(bot.token, fileId);
      if (!path) return null;
      const { bytes } = await this.telegram.downloadFile(bot.token, path, 256_000);
      const contentType = avatarContentType(bytes);
      return contentType ? { bytes, contentType } : null;
    } catch {
      // Profiles can be unavailable because of privacy settings or upstream errors.
      return null;
    }
  }

  async thread(workspaceId: string, id: string, cursor?: string) {
    const ticket = await this.ticket(workspaceId, id);
    const conversation = this.conversationScope(workspaceId, ticket);
    const scope: Prisma.TelegramSupportMessageWhereInput = ticket.botId
      ? { workspaceId, ticket: conversation }
      : { workspaceId, ticketId: ticket.id };
    const anchor =
      cursor &&
      (await this.db.telegramSupportMessage.findFirst({
        where: { ...scope, id: cursor },
        select: { id: true, createdAt: true },
      }));
    const [rows, lastInbound] = await Promise.all([
      this.db.telegramSupportMessage.findMany({
        where: {
          ...scope,
          ...(anchor
            ? {
                OR: [
                  { createdAt: { lt: anchor.createdAt } },
                  { createdAt: anchor.createdAt, id: { lt: anchor.id } },
                ],
              }
            : {}),
        },
        select: messageSelect,
        take: 51,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      cursor
        ? null
        : this.db.telegramSupportMessage.findFirst({
            where: { ...scope, status: 'INBOUND' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { createdAt: true },
          }),
    ]);
    const items = rows.slice(0, 50);
    return {
      items: items.map((message) => ({
        ...message,
        legacy: message.automatic && message.id.startsWith('legacy-auto:'),
      })),
      lastInboundAt: lastInbound?.createdAt ?? null,
      nextCursor: rows.length > 50 ? (items.at(-1)?.id ?? null) : null,
    };
  }

  private conversationScope(
    workspaceId: string,
    ticket: { product: SupportProduct; botId: string | null; chatId: string },
  ) {
    return { workspaceId, product: ticket.product, botId: ticket.botId, chatId: ticket.chatId };
  }

  async receive(
    product: SupportProduct,
    signature: string | undefined,
    update: SupportUpdate | undefined,
  ) {
    const bot = this.bots.authenticate(product, signature);
    if (update?.message_reaction) {
      await this.receiveReaction(product, bot, update.update_id, update.message_reaction);
      return { ok: true };
    }
    const message = update?.message;
    const from = message?.from;
    const chat = message?.chat;
    if (
      !Number.isSafeInteger(update?.update_id) ||
      chat?.type !== 'private' ||
      !from ||
      from.is_bot ||
      !Number.isSafeInteger(chat.id) ||
      chat.id !== from.id
    )
      return { ok: true };
    const text = (
      typeof message?.text === 'string'
        ? message.text
        : typeof message?.caption === 'string'
          ? message.caption
          : '[Attachment]'
    )
      .trim()
      .slice(0, 4096);
    if (!text) return { ok: true };
    const isStart = /^\/start(?:@\w+)?(?:\s|$)/i.test(text);
    const title = product === 'GROSHLY' ? 'Groshly' : 'Nexeloq';
    const greeting = `Дякуємо, що звернулися до служби підтримки ${title}! Адміністратор незабаром відповість у цьому чаті. Опишіть, будь ласка, чим ми можемо допомогти.`;
    const chatId = String(chat.id);
    const updateId = `${bot.botId}:${update?.update_id}`;
    const { workspaceId } = bot;
    const senderName =
      [from.first_name, from.last_name]
        .filter((value) => typeof value === 'string')
        .join(' ')
        .slice(0, 256) || 'Telegram user';
    const username =
      typeof from.username === 'string' ? from.username.slice(0, 64) : null;
    const receipt = await this.db.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `support-chat:${workspaceId}:${product}:${chatId}`,
      );
      if (
        await tx.telegramSupportMessage.findUnique({
          where: {
            workspaceId_product_updateId: { workspaceId, product, updateId },
          },
          select: { id: true },
        })
      )
        return null;
      const scope = this.conversationScope(workspaceId, { product, botId: bot.botId, chatId });
      const existing = await tx.telegramSupportTicket.findFirst({
        where: { ...scope, closedAt: null },
        select: { id: true },
      }) ?? await tx.telegramSupportTicket.findFirst({
        where: { ...scope, closedAt: { not: null } },
        orderBy: [{ closedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      const activity = {
        senderName,
        username,
        preview: text.slice(0, 240),
        needsReply: true,
      };
      const ticket = existing
        ? await tx.telegramSupportTicket.update({
            where: { id: existing.id },
            data: { ...activity, closedAt: null },
            select: { id: true },
          })
        : await tx.telegramSupportTicket.create({
            data: {
              workspaceId,
              product,
              botId: bot.botId,
              chatId,
              ...activity,
            },
            select: { id: true },
          });
      await tx.telegramSupportMessage.create({
        data: {
          ticketId: ticket.id,
          workspaceId,
          product,
          updateId,
          telegramMessageId: telegramMessageId(message?.message_id),
          replyToTelegramId: telegramMessageId(message?.reply_to_message?.message_id),
          text,
          status: 'INBOUND',
          ...(message?.date && Number.isSafeInteger(message.date) &&
          message.date > 0 && message.date <= Math.floor(Date.now() / 1000) + 60
            ? { createdAt: new Date(message.date * 1000) }
            : {}),
        },
      });
      if (!isStart || (existing && await tx.telegramSupportMessage.findFirst({
        where: { workspaceId, ticket: scope, automatic: true },
        select: { id: true },
      }))) return { automatic: null };
      const automatic = await tx.telegramSupportMessage.create({
        data: {
          ticketId: ticket.id,
          workspaceId,
          product,
          text: greeting,
          status: 'SENDING',
          automatic: true,
        },
        select: { id: true },
      });
      return { automatic };
    });
    if (!receipt) return { ok: true };
    this.changes.next(workspaceId);
    if (receipt.automatic) {
      const delivery = await this.deliver(bot.token, chatId, greeting);
      await this.db.telegramSupportMessage.update({
        where: { id: receipt.automatic.id },
        data: delivery,
        select: { id: true },
      });
      this.changes.next(workspaceId);
    }
    return { ok: true };
  }

  private async receiveReaction(
    product: SupportProduct,
    bot: { workspaceId: string; botId: string },
    updateId: number | undefined,
    reaction: NonNullable<SupportUpdate['message_reaction']>,
  ) {
    const messageId = telegramMessageId(reaction.chat?.type === 'private' ? reaction.message_id : undefined);
    const chatId = reaction.chat?.id;
    const date = telegramMessageId(reaction.date);
    if (!messageId || !date || !Number.isSafeInteger(updateId) || updateId === undefined ||
        !Number.isSafeInteger(chatId) || !reaction.user || reaction.user.is_bot ||
        reaction.user.id !== chatId || !Array.isArray(reaction.new_reaction)) return;

    const reactions = [...new Set(reaction.new_reaction.slice(0, 16).flatMap((item) => {
      if (item?.type === 'emoji' && typeof item.emoji === 'string' && item.emoji.length <= 32) return [item.emoji];
      if (item?.type === 'custom_emoji' && typeof item.custom_emoji_id === 'string' && /^\d{1,24}$/.test(item.custom_emoji_id)) return [`custom:${item.custom_emoji_id}`];
      if (item?.type === 'paid') return ['⭐'];
      return [];
    }))];
    const sequence = BigInt(updateId);
    const result = await this.db.telegramSupportMessage.updateMany({
      where: {
        workspaceId: bot.workspaceId,
        ticket: this.conversationScope(bot.workspaceId, { product, botId: bot.botId, chatId: String(chatId) }),
        telegramMessageId: messageId,
        deletedAt: null,
        OR: [
          { reactionDate: null }, { reactionDate: { lt: date } },
          { reactionDate: date, reactionUpdateId: { lt: sequence } },
        ],
      },
      data: { reactions, reactionDate: date, reactionUpdateId: sequence },
    });
    if (result.count) this.changes.next(bot.workspaceId);
  }

  private async deliver(token: string, chatId: string, text: string, formatted = false, replyToTelegramId?: number) {
    const send = (body: string) => this.telegram.sendMessage(token, {
      chat_id: chatId,
      text: body,
      ...(formatted && { parse_mode: 'HTML' }),
      link_preview_options: { is_disabled: true },
      ...(replyToTelegramId && { reply_parameters: { message_id: replyToTelegramId } }),
    });
    try {
      const result = formatted ? await sendTelegramCustomEmojiHtml(telegramMarkupToHtml(text), send) : await send(text);
      return { status: 'SENT', telegramMessageId: telegramMessageId(result.message_id) };
    } catch (error) {
      return { status: error instanceof TelegramBotApiError && error.explicitRejected ? 'FAILED' : 'UNKNOWN' };
    }
  }

  async close(workspaceId: string, id: string) {
    const ticket = await this.ticket(workspaceId, id);
    const result = await this.db.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `support-chat:${workspaceId}:${ticket.product}:${ticket.chatId}`,
      );
      return tx.telegramSupportTicket.updateMany({
        where: { id: ticket.id, workspaceId, closedAt: null },
        data: { closedAt: new Date(), needsReply: false },
      });
    });
    if (result.count) this.changes.next(workspaceId);
    return { ok: true };
  }

  async reopen(workspaceId: string, id: string) {
    const ticket = await this.ticket(workspaceId, id);
    const result = await this.db.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `support-chat:${workspaceId}:${ticket.product}:${ticket.chatId}`);
      const active = await tx.telegramSupportTicket.findFirst({
        where: { ...this.conversationScope(workspaceId, ticket), closedAt: null },
        select: { id: true },
      });
      if (active) return { id: active.id, changed: false };
      const updated = await tx.telegramSupportTicket.updateMany({
        where: { workspaceId, id, closedAt: { not: null } },
        data: { closedAt: null, needsReply: true },
      });
      return { id, changed: updated.count > 0 };
    });
    if (result.changed) this.changes.next(workspaceId);
    return { id: result.id };
  }

  async reply(workspaceId: string, id: string, replyId: string, text: string, formatted = false, targetId?: string) {
    const ticket = await this.ticket(workspaceId, id);
    const bot = this.bots.resolve(ticket.product);
    if (!bot || bot.workspaceId !== workspaceId || bot.botId !== ticket.botId)
      throw new ServiceUnavailableException(
        'The original support bot is not configured',
      );
    const reservation = await this.db.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `support-reply:${id}`);
      const existing = await tx.telegramSupportMessage.findUnique({
        where: { ticketId_replyId: { ticketId: id, replyId } },
        select: messageSelect,
      });
      if (existing)
        return { message: existing, send: false, updatedAt: ticket.updatedAt };
      const open = await tx.telegramSupportTicket.findFirst({
        where: { id, workspaceId, closedAt: null },
        select: { updatedAt: true },
      });
      if (!open) throw new ConflictException('This ticket is closed');
      const target = targetId ? await tx.telegramSupportMessage.findFirst({
        where: { id: targetId, workspaceId, ticket: this.conversationScope(workspaceId, ticket), deletedAt: null },
        select: { telegramMessageId: true },
      }) : null;
      if (targetId && !target?.telegramMessageId)
        throw new ConflictException('Telegram reply target is unavailable');

      const message = await tx.telegramSupportMessage.create({
        data: {
          ticketId: id,
          workspaceId,
          product: ticket.product,
          replyId,
          text,
          formatted,
          replyToTelegramId: target?.telegramMessageId,
          status: 'SENDING',
        },
        select: messageSelect,
      });
      return { message, send: true, updatedAt: open.updatedAt };
    });
    if (!reservation.send) return reservation.message;
    const delivery = await this.deliver(
      bot.token, ticket.chatId, text, formatted, reservation.message.replyToTelegramId ?? undefined,
    );
    const result = await this.db.$transaction(async (tx) => {
      const message = await tx.telegramSupportMessage.update({
        where: { id: reservation.message.id },
        data: delivery,
        select: messageSelect,
      });
      if (delivery.status === 'SENT')
        await tx.telegramSupportTicket.updateMany({
          where: {
            id,
            workspaceId,
            closedAt: null,
            updatedAt: reservation.updatedAt,
          },
          data: { needsReply: false },
        });
      return message;
    });
    this.changes.next(workspaceId);
    return result;
  }
  async changeMessage(workspaceId: string, id: string, messageId: string, text?: string) {
    const ticket = await this.ticket(workspaceId, id);
    const bot = this.bots.resolve(ticket.product);
    if (!bot || bot.workspaceId !== workspaceId || bot.botId !== ticket.botId)
      throw new ServiceUnavailableException('The original support bot is not configured');

    const message = await this.db.telegramSupportMessage.findFirst({
      where: { id: messageId, workspaceId, ticket: this.conversationScope(workspaceId, ticket) },
      select: messageSelect,
    });
    if (!message) throw new NotFoundException('Support message not found');
    if (text === undefined && message.deletedAt) return message;
    if (!message.telegramMessageId || message.deletedAt ||
        (text !== undefined && (message.status !== 'SENT' || message.automatic)))
      throw new ConflictException('This Telegram message cannot be changed');
    if (text === undefined && Date.now() - message.createdAt.getTime() >= 48 * 60 * 60_000)
      throw new ConflictException('Telegram only allows deleting messages less than 48 hours old');

    const address = { chat_id: ticket.chatId, message_id: message.telegramMessageId };
    try {
      if (text === undefined) {
        if (!await this.telegram.deleteMessage(bot.token, address))
          throw new Error('Deletion not confirmed');
      } else if (text !== message.text || !message.formatted) {
        await sendTelegramCustomEmojiHtml(telegramMarkupToHtml(text), (html) =>
          this.telegram.editMessageText(bot.token, { ...address, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
        );
      } else {
        return message;
      }
    } catch (error) {
      const alreadyApplied = error instanceof TelegramBotApiError && error.explicitRejected &&
        (text === undefined ? /message to delete not found/i : /message is not modified/i).test(error.message);
      if (!alreadyApplied) throw new BadGatewayException('Telegram did not confirm the message change');
    }
    const result = await this.db.telegramSupportMessage.update({
      where: { id: message.id, deletedAt: null },
      data: text === undefined
        ? { deletedAt: new Date(), text: '', reactions: [] }
        : { text, formatted: true, editedAt: new Date() },
      select: messageSelect,
    });
    this.changes.next(workspaceId);
    return result;
  }

}
