import { TelegramCrmChatAccess } from './telegram-crm-chat-access.service';
import { crmMessageSelect, mapCrmMessage } from './telegram-crm-message.mapper';
import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { isPrismaUniqueConflict } from './telegram-crm-prisma-errors';

export const manualTextHash = (text: string) =>
  createHash('sha256').update(text).digest('hex');

/** Text uses the same durable claim store; unknown sends never become an automatic second send. */
@Injectable()
export class TelegramCrmManualSendIntentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TelegramCrmChatAccess,
  ) {}
  async lookup(userId: string, conversationId: string, key: string) {
    const { row } = await this.access.conversation(
      userId,
      conversationId,
      true,
    );
    if (!key || key.length > 128)
      throw new ConflictException('CHAT_SEND_KEY_INVALID');
    const receipt = await this.prisma.telegramCrmMessage.findFirst({
      where: {
        workspaceId: row.workspaceId,
        conversationId,
        clientIdempotencyKey: key,
      },
      select: crmMessageSelect,
    });
    return receipt
      ? {
          message: { ...mapCrmMessage(receipt), sentByMember: null },
          idempotentReplay: true,
        }
      : null;
  }
  async claim(input: {
    workspaceId: string;
    conversationId: string;
    mtprotoAccountId: string;
    userId: string;
    key: string;
    text: string;
    replyToMessageId?: string;
    aiDraftId?: string;
    aiDraftRevision?: number;
  }) {
    const operationId = `text:${manualTextHash(`${input.conversationId}\0${input.key}`)}`;
    const request = {
      textHash: manualTextHash(input.text),
      replyToMessageId: input.replyToMessageId ?? null,
      aiDraftId: input.aiDraftId ?? null,
      aiDraftRevision: input.aiDraftRevision ?? null,
    };
    const requestFingerprint = manualTextHash(
      JSON.stringify({ ...request, userId: input.userId }),
    );
    const existing = await this.prisma.telegramCrmChatOperation.findUnique({
      where: {
        workspaceId_operationId: {
          workspaceId: input.workspaceId,
          operationId,
        },
      },
    });
    if (existing) {
      if (
        existing.requestFingerprint !== requestFingerprint ||
        existing.actorUserId !== input.userId
      )
        throw new ConflictException('CHAT_OPERATION_CONFLICT');
      // Normal replay is returned by the existing message receipt before this claim.
      throw new ConflictException(
        'CHAT_SEND_OUTCOME_UNKNOWN_RECONCILE_TELEGRAM',
      );
    }
    try {
      await this.prisma.telegramCrmChatOperation.create({
        data: {
          workspaceId: input.workspaceId,
          operationId,
          actorUserId: input.userId,
          conversationId: input.conversationId,
          mtprotoAccountId: input.mtprotoAccountId,
          kind: 'TEXT',
          targetMessageId: `text:${request.textHash}:${input.replyToMessageId ?? ''}`,
          requestFingerprint,
          request,
          status: 'UNKNOWN',
        },
      });
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) throw error;
      throw new ConflictException(
        'CHAT_SEND_OUTCOME_UNKNOWN_RECONCILE_TELEGRAM',
      );
    }
    return operationId;
  }
  async confirmed(workspaceId: string, operationId: string, messageId: string) {
    await this.prisma.telegramCrmChatOperation.update({
      where: { workspaceId_operationId: { workspaceId, operationId } },
      data: { status: 'CONFIRMED', result: { messageId } },
    });
  }
}
