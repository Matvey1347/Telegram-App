import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, type TelegramCrmChatOperation } from '@prisma/client';
import type { CrmChatActionResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { crmMessageSelect, mapCrmMessage } from './telegram-crm-message.mapper';
import { isPrismaUniqueConflict } from './telegram-crm-prisma-errors';

export function chatOperationFingerprint(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
export function chatRandomId(
  accountId: string,
  conversationId: string,
  operationId: string,
) {
  return createHash('sha256')
    .update(`${accountId}\0${conversationId}\0${operationId}`)
    .digest()
    .readBigInt64BE(0);
}
@Injectable()
export class TelegramCrmChatReceipts {
  constructor(private readonly prisma: PrismaService) {}
  /** Existing daily maintenance; retain UNKNOWN claims until verified or account removal. */
  cleanup(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - 30 * 86400000);
    return this.prisma.$executeRaw(Prisma.sql`
      WITH expired AS (
        SELECT id FROM "TelegramCrmChatOperation" WHERE kind <> 'TEXT' AND status <> 'UNKNOWN' AND "createdAt" < ${before}
        ORDER BY "createdAt", id LIMIT 20000 FOR UPDATE SKIP LOCKED
      ) DELETE FROM "TelegramCrmChatOperation" WHERE id IN (SELECT id FROM expired)
    `);
  }
  find(workspaceId: string, operationId: string) {
    return this.prisma.telegramCrmChatOperation.findUnique({
      where: { workspaceId_operationId: { workspaceId, operationId } },
    });
  }
  async claim(input: {
    workspaceId: string;
    operationId: string;
    actorUserId: string;
    conversationId: string;
    mtprotoAccountId: string;
    targetMessageId?: string;
    kind: string;
    request: Prisma.InputJsonObject;
    fingerprint: string;
  }) {
    const existing = await this.find(input.workspaceId, input.operationId);
    if (existing) {
      this.assertSame(existing, input);
      return { receipt: existing, fresh: false };
    }
    if (
      !/^\d{4}-\d{2}-\d{2}:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.operationId,
      )
    )
      throw new BadRequestException('CHAT_OPERATION_ID_INVALID');
    if (
      input.operationId.slice(0, 10) !== new Date().toISOString().slice(0, 10)
    )
      throw new ConflictException('CHAT_OPERATION_EXPIRED');
    const { fingerprint, ...data } = input;
    try {
      return {
        receipt: await this.prisma.telegramCrmChatOperation.create({
          data: { ...data, requestFingerprint: fingerprint },
        }),
        fresh: true,
      };
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) throw error;
      const raced = await this.find(input.workspaceId, input.operationId);
      if (!raced) throw new ConflictException('CHAT_MESSAGE_OPERATION_PENDING');
      this.assertSame(raced, input);
      return { receipt: raced, fresh: false };
    }
  }
  private assertSame(
    row: TelegramCrmChatOperation,
    input: { fingerprint: string; actorUserId: string; conversationId: string },
  ) {
    if (
      row.requestFingerprint !== input.fingerprint ||
      row.actorUserId !== input.actorUserId ||
      row.conversationId !== input.conversationId
    )
      throw new ConflictException('CHAT_OPERATION_CONFLICT');
  }
  async finish(row: TelegramCrmChatOperation, result: CrmChatActionResult) {
    const { message, ...compact } = result;
    return this.prisma.telegramCrmChatOperation.update({
      where: { id: row.id },
      data: {
        status: result.status,
        result: {
          ...compact,
          ...(message ? { messageId: message.id } : {}),
        },
      },
    });
  }
  async response(row: TelegramCrmChatOperation): Promise<CrmChatActionResult> {
    const result = (row.result ?? {}) as {
      messageId?: string;
      deletedMessageIds?: string[];
      errorCode?: string;
      conversationId?: string;
    };
    const message = result.messageId
      ? await this.prisma.telegramCrmMessage.findFirst({
          where: {
            id: result.messageId,
            workspaceId: row.workspaceId,
            conversationId: result.conversationId ?? row.conversationId,
          },
          select: crmMessageSelect,
        })
      : null;
    return {
      operationId: row.operationId,
      status: row.status as CrmChatActionResult['status'],
      conversationId: result.conversationId ?? row.conversationId,
      ...(message
        ? { message: { ...mapCrmMessage(message), sentByMember: null } }
        : {}),
      ...(result.deletedMessageIds
        ? { deletedMessageIds: result.deletedMessageIds }
        : {}),
      ...(result.errorCode ? { errorCode: result.errorCode } : {}),
    };
  }
}
