import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TelegramCrmDeliveryState,
  TelegramCrmMessageDirection,
  TelegramCrmMessageOrigin,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { CrmManualMessageResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { SendCrmManualMessageDto } from './telegram-crm-inbox.dto';
import {
  crmMessageSelect,
  mapCrmMessage,
} from './telegram-crm-message.mapper';
import {
  crmMemberSummarySelect,
  mapCrmMemberSummary,
} from './telegram-crm-read-model.mapper';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';
import { isPrismaUniqueConflict } from './telegram-crm-prisma-errors';

const crmManualMessageSelect = {
  ...crmMessageSelect,
  sentByMember: { select: crmMemberSummarySelect },
} satisfies Prisma.TelegramCrmMessageSelect;

type CrmManualMessageRow = Prisma.TelegramCrmMessageGetPayload<{
  select: typeof crmManualMessageSelect;
}>;

const mapCrmManualMessage = (row: CrmManualMessageRow) => ({
  ...mapCrmMessage(row),
  sentByMember: mapCrmMemberSummary(row.sentByMember ?? null),
});

@Injectable()
export class TelegramCrmManualSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly events: TelegramCrmEventHub,
  ) {}

  async send(
    userId: string,
    conversationId: string,
    dto: SendCrmManualMessageDto,
  ): Promise<CrmManualMessageResult> {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.sendManualMessages',
    );
    const text = dto.text.trim();
    const key = dto.clientIdempotencyKey.trim();
    if (!text) throw new BadRequestException('Message text is required');
    if (!key)
      throw new BadRequestException('Client idempotency key is required');
    const conversation = await this.prisma.telegramCrmConversation.findFirst({
      where: { id: conversationId, workspaceId: access.workspaceId },
      select: {
        id: true,
        workspaceId: true,
        mtprotoAccountId: true,
        telegramAccessHash: true,
        contactId: true,
        peer: { select: { id: true, telegramUserId: true, username: true } },
        contact: { select: { ownerMemberId: true } },
      },
    });
    if (!conversation)
      throw new NotFoundException('CRM Conversation not found');
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: conversation.contact?.ownerMemberId ?? null },
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const replay = await this.findReplay(conversation.id, key, text);
    if (replay)
      return { message: mapCrmManualMessage(replay), idempotentReplay: true };

    const sent = await this.runtime.withAccountHandle(
      access.workspaceId,
      conversation.mtprotoAccountId,
      'send',
      async (handle) => {
        const peer = conversation.telegramAccessHash
          ? {
              telegramUserId: conversation.peer.telegramUserId,
              telegramAccessHash: conversation.telegramAccessHash,
            }
          : await handle.resolvePrivatePeer({
              telegramUserId: conversation.peer.telegramUserId,
              username: conversation.peer.username,
            });
        if (!conversation.telegramAccessHash) {
          await this.prisma.telegramCrmConversation.updateMany({
            where: {
              id: conversation.id,
              workspaceId: access.workspaceId,
              telegramAccessHash: null,
            },
            data: { telegramAccessHash: peer.telegramAccessHash },
          });
        }
        return handle.sendText({
          telegramUserId: peer.telegramUserId,
          telegramAccessHash: peer.telegramAccessHash,
          text,
          randomId: this.randomId(
            conversation.mtprotoAccountId,
            conversation.id,
            key,
          ),
        });
      },
    );
    let transactionResult: {
      row: CrmManualMessageRow;
      replay: boolean;
    };
    try {
      transactionResult = await this.prisma.$transaction(async (tx) => {
        const replayInside = await tx.telegramCrmMessage.findUnique({
          where: {
            conversationId_clientIdempotencyKey: {
              conversationId: conversation.id,
              clientIdempotencyKey: key,
            },
          },
          select: crmManualMessageSelect,
        });
        if (replayInside) {
          if (replayInside.text !== text) {
            throw new ConflictException(
              'Idempotency key was used for different text',
            );
          }
          return { row: replayInside, replay: true };
        }
        const echo = await tx.telegramCrmMessage.findUnique({
          where: {
            conversationId_telegramMessageId: {
              conversationId: conversation.id,
              telegramMessageId: String(sent.telegramMessageId),
            },
          },
          select: crmManualMessageSelect,
        });
        if (
          echo &&
          echo.origin !== TelegramCrmMessageOrigin.TELEGRAM_SYNC &&
          echo.origin !== TelegramCrmMessageOrigin.MANUAL
        ) {
          throw new ConflictException(
            'Telegram message is already attributed to another origin',
          );
        }
        const stored = echo
          ? await tx.telegramCrmMessage.update({
              where: { id: echo.id },
              data: {
                origin: TelegramCrmMessageOrigin.MANUAL,
                direction: TelegramCrmMessageDirection.OUTBOUND,
                sentByMemberId: access.memberId,
                clientIdempotencyKey: key,
                telegramMessageIdNumeric: sent.telegramMessageId,
                text,
                sentAt: sent.sentAt,
                deliveryState: TelegramCrmDeliveryState.SENT,
              },
              select: crmManualMessageSelect,
            })
          : await tx.telegramCrmMessage.create({
              data: {
                workspaceId: access.workspaceId,
                conversationId: conversation.id,
                mtprotoAccountId: conversation.mtprotoAccountId,
                telegramMessageId: String(sent.telegramMessageId),
                telegramMessageIdNumeric: sent.telegramMessageId,
                clientIdempotencyKey: key,
                direction: TelegramCrmMessageDirection.OUTBOUND,
                origin: TelegramCrmMessageOrigin.MANUAL,
                sentByMemberId: access.memberId,
                text,
                sentAt: sent.sentAt,
                deliveryState: TelegramCrmDeliveryState.SENT,
              },
              select: crmManualMessageSelect,
            });
        await tx.telegramCrmConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: sent.sentAt,
            lastOutboundAt: sent.sentAt,
            lastMeaningfulSyncAt: new Date(),
          },
        });
        if (conversation.contactId) {
          await tx.telegramAdvertiser.update({
            where: { id: conversation.contactId },
            data: {
              lastContactAt: sent.sentAt,
              lastOutboundAt: sent.sentAt,
            },
          });
        }
        return { row: stored, replay: false };
      });
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) throw error;
      const replayAfterRace = await this.findReplay(conversation.id, key, text);
      if (!replayAfterRace) throw error;
      transactionResult = { row: replayAfterRace, replay: true };
    }
    const message = mapCrmManualMessage(transactionResult.row);
    if (transactionResult.replay) {
      return { message, idempotentReplay: true };
    }
    this.events.emit({
      type: 'message.sent',
      workspaceId: access.workspaceId,
      occurredAt: new Date().toISOString(),
      conversationId: conversation.id,
      contactId: conversation.contactId,
      ownerMemberId: conversation.contact?.ownerMemberId ?? null,
      message,
    });
    if (conversation.contactId) {
      this.events.emit({
        type: 'contact.updated',
        workspaceId: access.workspaceId,
        occurredAt: new Date().toISOString(),
        contactId: conversation.contactId,
        ownerMemberId: conversation.contact?.ownerMemberId ?? null,
      });
    } else {
      this.events.emit({
        type: 'inbox.updated',
        workspaceId: access.workspaceId,
        occurredAt: new Date().toISOString(),
        peerId: conversation.peer.id,
        contactId: null,
        ownerMemberId: null,
        conversation: null,
      });
    }
    return { message, idempotentReplay: false };
  }

  private async findReplay(conversationId: string, key: string, text: string) {
    const existing = await this.prisma.telegramCrmMessage.findUnique({
      where: {
        conversationId_clientIdempotencyKey: {
          conversationId,
          clientIdempotencyKey: key,
        },
      },
      select: crmManualMessageSelect,
    });
    if (existing && existing.text !== text) {
      throw new ConflictException(
        'Idempotency key was used for different text',
      );
    }
    return existing;
  }

  private randomId(accountId: string, conversationId: string, key: string) {
    return createHash('sha256')
      .update(`${accountId}\0${conversationId}\0${key}`)
      .digest()
      .readBigInt64BE(0);
  }
}
