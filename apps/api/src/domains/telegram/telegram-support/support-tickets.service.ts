import {
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
import { TelegramBotApiClient } from '../../../telegram/shared/bot/telegram-bot-api.client';
import { SUPPORT_PRODUCTS, SupportBotsService } from './support-bots.service';

const ticketSelect = {
  id: true,
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
  createdAt: true,
} satisfies Prisma.TelegramSupportMessageSelect;

export type SupportUpdate = {
  update_id?: number;
  message?: {
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

  async thread(workspaceId: string, id: string, cursor?: string) {
    const ticket = await this.ticket(workspaceId, id);
    const anchor =
      cursor &&
      (await this.db.telegramSupportMessage.findFirst({
        where: { id: cursor, ticketId: ticket.id },
        select: { id: true, createdAt: true },
      }));
    const rows = await this.db.telegramSupportMessage.findMany({
      where: {
        ticketId: ticket.id,
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
    });
    const items = rows.slice(0, 50);
    return {
      items,
      nextCursor: rows.length > 50 ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async receive(
    product: SupportProduct,
    signature: string | undefined,
    update: SupportUpdate | undefined,
  ) {
    const bot = this.bots.authenticate(product, signature);
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
    if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
      const title = product === 'GROSHLY' ? 'Groshly' : 'Nexeloq';
      return {
        method: 'sendMessage',
        chat_id: chat.id,
        text: `${title} Support. Send us a message describing what you need help with.`,
      };
    }
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
    const changed = await this.db.$transaction(async (tx) => {
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
        return false;
      const existing = await tx.telegramSupportTicket.findFirst({
        where: {
          workspaceId,
          product,
          botId: bot.botId,
          chatId,
          closedAt: null,
        },
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
            data: activity,
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
          text,
          status: 'INBOUND',
        },
      });
      return true;
    });
    if (changed) this.changes.next(workspaceId);
    return { ok: true };
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

  async reply(workspaceId: string, id: string, replyId: string, text: string) {
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
      const message = await tx.telegramSupportMessage.create({
        data: {
          ticketId: id,
          workspaceId,
          product: ticket.product,
          replyId,
          text,
          status: 'SENDING',
        },
        select: messageSelect,
      });
      return { message, send: true, updatedAt: open.updatedAt };
    });
    if (!reservation.send) return reservation.message;
    let status = 'SENT';
    try {
      await this.telegram.sendMessage(bot.token, {
        chat_id: ticket.chatId,
        text,
        link_preview_options: { is_disabled: true },
      });
    } catch {
      // A transport failure may occur after Telegram accepted the message.
      status = 'UNKNOWN';
    }
    const result = await this.db.$transaction(async (tx) => {
      const message = await tx.telegramSupportMessage.update({
        where: { id: reservation.message.id },
        data: { status },
        select: messageSelect,
      });
      if (status === 'SENT')
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
}
