import {
  TelegramCrmManualSendIntentService,
  manualTextHash,
} from './telegram-crm-manual-send-intent.service';
import { resolveManualReply } from './telegram-crm-manual-reply';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
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
import { crmMessageSelect, mapCrmMessage } from './telegram-crm-message.mapper';
import {
  crmMemberSummarySelect,
  mapCrmMemberSummary,
} from './telegram-crm-read-model.mapper';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';
import { isPrismaUniqueConflict } from './telegram-crm-prisma-errors';
import { advanceCrmManualSendCompact } from './telegram-crm-manual-send-compact';
import { TelegramCrmCopilotSendGuard } from './telegram-crm-copilot-send-guard.service';
import { ResponseCacheService } from '../../../common/response-cache.service';

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
    @Optional() private readonly responseCache?: ResponseCacheService,
    @Optional() private readonly copilot?: TelegramCrmCopilotSendGuard,
    @Optional() private readonly intents?: TelegramCrmManualSendIntentService,
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
    if (Boolean(dto.aiDraftId) !== (dto.aiDraftRevision !== undefined))
      throw new BadRequestException('COPILOT_APPROVAL_INCOMPLETE');
    const approval = dto.aiDraftId
      ? { aiDraftId: dto.aiDraftId, aiDraftRevision: dto.aiDraftRevision! }
      : undefined;
    if (approval && !this.copilot)
      throw new ConflictException('COPILOT_APPROVAL_UNAVAILABLE');
    const key = dto.clientIdempotencyKey.trim();
    if (!approval && key.startsWith('ai:'))
      throw new BadRequestException('COPILOT_APPROVAL_REQUIRED');
    if (!text) throw new BadRequestException('Message text is required');
    if (
      approval &&
      key !== `ai:${approval.aiDraftId}:${approval.aiDraftRevision}`
    )
      throw new BadRequestException('COPILOT_IDEMPOTENCY_KEY_REQUIRED');
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
        contact: { select: { ownerMemberId: true, manualSalesStatus: true } },
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
    // The idempotency body is the trimmed editor markup stored on MANUAL rows.
    // Telegram's rendered text would lose entities and conflict on a retry.
    const replay = await this.findReplay(
      conversation.id,
      key,
      text,
      dto.replyToMessageId,
    );
    if (replay) {
      if (
        approval &&
        (
          replay.contentMetadata as {
            aiDraftId?: string;
            aiDraftRevision?: number;
          } | null
        )?.aiDraftId !== approval.aiDraftId
      )
        throw new ConflictException('COPILOT_RECEIPT_MISMATCH');
      if (
        approval &&
        (replay.contentMetadata as { aiDraftRevision?: number } | null)
          ?.aiDraftRevision !== approval.aiDraftRevision
      )
        throw new ConflictException('COPILOT_RECEIPT_MISMATCH');
      if (approval)
        await this.copilot!.markSent(
          userId,
          conversationId,
          approval,
          replay.id,
          access.workspaceId,
        );
      return { message: mapCrmManualMessage(replay), idempotentReplay: true };
    }

    if (conversation.contact?.manualSalesStatus === 'DO_NOT_CONTACT') {
      throw new ForbiddenException(
        'Do not contact: clear the sales restriction before sending',
      );
    }
    let intent: string | undefined;
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
        await this.authorization.refresh(userId);
        const currentAccess = await this.authorization.require(
          userId,
          'adSales.crm.sendManualMessages',
        );
        if (
          currentAccess.workspaceId !== access.workspaceId ||
          currentAccess.memberId !== access.memberId
        )
          throw new ForbiddenException('CRM_SEND_ACCESS_CHANGED');
        const ownership = await this.authorization.scope(
          userId,
          'adSales.crm.viewOwn',
          'adSales.crm.viewAny',
        );
        const current = await this.prisma.telegramCrmConversation.findFirst({
          where: {
            id: conversation.id,
            workspaceId: access.workspaceId,
            ...('assignedMemberId' in ownership
              ? { contact: { ownerMemberId: ownership.assignedMemberId } }
              : {}),
          },
          select: { contact: { select: { manualSalesStatus: true } } },
        });
        if (!current || current.contact?.manualSalesStatus === 'DO_NOT_CONTACT')
          throw new ForbiddenException(
            'Do not contact or ownership changed: review this client before sending',
          );
        if (approval)
          await this.copilot!.assertCanSend(
            userId,
            conversationId,
            text,
            approval,
          );
        const replyToTelegramMessageId = await resolveManualReply(
          this.prisma,
          handle,
          conversation,
          peer,
          dto.replyToMessageId,
        );
        intent = await this.intents?.claim({
          workspaceId: access.workspaceId,
          conversationId: conversation.id,
          mtprotoAccountId: conversation.mtprotoAccountId,
          userId,
          key,
          text,
          replyToMessageId: dto.replyToMessageId,
          ...approval,
        });
        return handle.sendText({
          ...(replyToTelegramMessageId ? { replyToTelegramMessageId } : {}),
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
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "TelegramCrmConversation" WHERE id=${conversation.id} AND "workspaceId"=${access.workspaceId} FOR UPDATE`,
        );
        const tombstone = await tx.telegramCrmDeletedMessage.findUnique({
          where: {
            mtprotoAccountId_telegramMessageId: {
              mtprotoAccountId: conversation.mtprotoAccountId,
              telegramMessageId: sent.telegramMessageId,
            },
          },
        });
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
          if (!this.matchesReplay(replayInside, text, dto.replyToMessageId)) {
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
        const deletedAt = echo?.deletedAt ?? (tombstone ? new Date() : null);
        const receiptMetadata = {
          ...approval,
          manualRequestHash: manualTextHash(text),
          requestReplyToMessageId: dto.replyToMessageId ?? null,
        };
        const metadata = deletedAt
          ? receiptMetadata
          : { ...sent.contentMetadata, ...receiptMetadata, telegramText: true };
        const stored = echo
          ? await tx.telegramCrmMessage.update({
              where: { id: echo.id },
              data: {
                contentMetadata: metadata,
                origin: TelegramCrmMessageOrigin.MANUAL,
                direction: TelegramCrmMessageDirection.OUTBOUND,
                sentByMemberId: access.memberId,
                clientIdempotencyKey: key,
                telegramMessageIdNumeric: sent.telegramMessageId,
                deletedAt,
                text: deletedAt ? null : sent.text,
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
                contentMetadata: metadata,
                origin: TelegramCrmMessageOrigin.MANUAL,
                sentByMemberId: access.memberId,
                deletedAt,
                text: deletedAt ? null : sent.text,
                sentAt: sent.sentAt,
                deliveryState: TelegramCrmDeliveryState.SENT,
              },
              select: crmManualMessageSelect,
            });
        if (!deletedAt)
          await advanceCrmManualSendCompact(tx, {
            workspaceId: access.workspaceId,
            conversationId: conversation.id,
            contactId: conversation.contactId,
            sentAt: sent.sentAt,
            increment: !echo,
          });
        return { row: stored, replay: false };
      });
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) throw error;
      const replayAfterRace = await this.findReplay(
        conversation.id,
        key,
        text,
        dto.replyToMessageId,
      );
      if (!replayAfterRace) throw error;
      transactionResult = { row: replayAfterRace, replay: true };
    }
    if (approval)
      await this.copilot!.markSent(
        userId,
        conversationId,
        approval,
        transactionResult.row.id,
        access.workspaceId,
      );
    const message = mapCrmManualMessage(transactionResult.row);
    if (intent)
      await this.intents!.confirmed(access.workspaceId, intent, message.id);
    if (transactionResult.replay) {
      return { message, idempotentReplay: true };
    }
    this.responseCache?.clearWorkspacePath(
      access.workspaceId,
      `/telegram-crm/conversations/${conversation.id}/messages`,
    );
    if (conversation.contactId) {
      this.responseCache?.clearWorkspacePath(
        access.workspaceId,
        '/telegram-crm/contacts',
      );
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

  private matchesReplay(
    row: CrmManualMessageRow,
    text: string,
    replyToMessageId?: string,
  ) {
    const meta = row.contentMetadata as {
      manualRequestHash?: string;
      requestReplyToMessageId?: string | null;
    } | null;
    return (
      (meta?.manualRequestHash
        ? meta.manualRequestHash === manualTextHash(text)
        : row.text === text) &&
      (meta?.requestReplyToMessageId ?? null) === (replyToMessageId ?? null)
    );
  }

  private async findReplay(
    conversationId: string,
    key: string,
    text: string,
    replyToMessageId?: string,
  ) {
    const existing = await this.prisma.telegramCrmMessage.findUnique({
      where: {
        conversationId_clientIdempotencyKey: {
          conversationId,
          clientIdempotencyKey: key,
        },
      },
      select: crmManualMessageSelect,
    });
    if (existing && !this.matchesReplay(existing, text, replyToMessageId)) {
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
