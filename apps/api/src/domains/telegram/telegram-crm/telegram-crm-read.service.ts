import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  Prisma,
  TelegramCrmMessageDirection,
  TelegramCrmReadState,
} from '@prisma/client';
import type { CrmConversationReadResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';
import { TelegramCrmIncomingNotificationProjector } from './telegram-crm-incoming-notification-projector.service';
import { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import { ResponseCacheService } from '../../../common/response-cache.service';

@Injectable()
export class TelegramCrmReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly events: TelegramCrmEventHub,
    @Optional()
    private readonly notificationProjector?: TelegramCrmIncomingNotificationProjector,
    @Optional()
    private readonly notificationPublisher?: OperationsNotificationPublisherService,
    @Optional()
    private readonly responseCache?: ResponseCacheService,
  ) {}

  async markRead(
    userId: string,
    conversationId: string,
    maxTelegramMessageId?: number,
  ): Promise<CrmConversationReadResult> {
    if (
      maxTelegramMessageId !== undefined &&
      (!Number.isInteger(maxTelegramMessageId) ||
        maxTelegramMessageId < 1 ||
        maxTelegramMessageId > 2_147_483_647)
    )
      throw new BadRequestException('Invalid Telegram read watermark');
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const conversation = await this.prisma.telegramCrmConversation.findFirst({
      where: { id: conversationId, workspaceId: access.workspaceId },
      select: {
        id: true,
        mtprotoAccountId: true,
        telegramAccessHash: true,
        contactId: true,
        unreadCount: true,
        lastReadInboxTelegramMessageId: true,
        peer: { select: { id: true, telegramUserId: true, username: true } },
        contact: { select: { ownerMemberId: true } },
        messages: {
          where: {
            deletedAt: null,
            telegramMessageIdNumeric: {
              not: null,
              ...(maxTelegramMessageId !== undefined
                ? { lte: maxTelegramMessageId }
                : {}),
            },
          },
          orderBy: { telegramMessageIdNumeric: 'desc' },
          take: 1,
          select: { telegramMessageIdNumeric: true },
        },
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
    const maxId = conversation.messages[0]?.telegramMessageIdNumeric ?? null;
    if (maxId == null) {
      if (maxTelegramMessageId !== undefined)
        throw new BadRequestException('Viewed Telegram message not found');
      if (conversation.unreadCount > 0) {
        throw new BadRequestException(
          'Import current Telegram history before marking this Conversation read',
        );
      }
      const current = await this.prisma.$transaction(async (tx) => {
        const state = await this.lockState(
          tx,
          access.workspaceId,
          conversationId,
        );
        const invalidated =
          state.unreadCount === 0 && this.notificationProjector
            ? await this.notificationProjector.reconcileConversationGroups(
                tx,
                access.workspaceId,
                [
                  {
                    conversationId,
                    contactId: conversation.contactId,
                    unreadCount: 0,
                  },
                ],
              )
            : [];
        return { ...state, invalidated };
      });
      this.notificationPublisher?.invalidate(
        access.workspaceId,
        current.invalidated,
      );
      this.responseCache?.clearWorkspacePath(
        access.workspaceId,
        `/telegram-crm/conversations/${conversationId}/messages`,
      );
      if (conversation.contactId) {
        this.responseCache?.clearWorkspacePath(
          access.workspaceId,
          '/telegram-crm/contacts',
        );
      }
      return {
        conversationId,
        lastReadInboxTelegramMessageId: current.lastReadInboxTelegramMessageId,
        readMessageCount: 0,
        unreadCount: current.unreadCount,
      };
    }
    if (
      conversation.lastReadInboxTelegramMessageId == null ||
      conversation.lastReadInboxTelegramMessageId < maxId ||
      conversation.unreadCount > 0
    ) {
      await this.runtime.withAccountHandle(
        access.workspaceId,
        conversation.mtprotoAccountId,
        'sync',
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
          await handle.markRead({
            telegramUserId: peer.telegramUserId,
            telegramAccessHash: peer.telegramAccessHash,
            maxTelegramMessageId: maxId,
          });
        },
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const messages = await tx.telegramCrmMessage.updateMany({
        where: {
          workspaceId: access.workspaceId,
          conversationId,
          direction: TelegramCrmMessageDirection.INBOUND,
          telegramMessageIdNumeric: { lte: maxId },
          readState: { not: TelegramCrmReadState.READ },
        },
        data: { readState: TelegramCrmReadState.READ },
      });
      // Serialize compact state after marking only the viewed watermark. A new
      // message committed during the Telegram call must remain unread.
      const current = await this.lockState(
        tx,
        access.workspaceId,
        conversationId,
      );
      const unreadCount = await tx.telegramCrmMessage.count({
        where: {
          workspaceId: access.workspaceId,
          conversationId,
          direction: TelegramCrmMessageDirection.INBOUND,
          readState: TelegramCrmReadState.UNREAD,
          OR: [
            { telegramMessageIdNumeric: { gt: maxId } },
            { telegramMessageIdNumeric: null },
          ],
        },
      });
      const watermark = Math.max(
        current.lastReadInboxTelegramMessageId ?? 0,
        maxId,
      );
      const changed =
        current.lastReadInboxTelegramMessageId !== watermark ||
        current.unreadCount !== unreadCount;
      if (changed) {
        await tx.telegramCrmConversation.update({
          where: { id: conversationId, workspaceId: access.workspaceId },
          data: {
            lastReadInboxTelegramMessageId: watermark,
            lastReadTelegramMessageId: String(watermark),
            lastReadAt: new Date(),
            unreadCount,
            readState: unreadCount
              ? TelegramCrmReadState.UNREAD
              : TelegramCrmReadState.READ,
          },
        });
      }
      const invalidatedNotificationMemberIds = this.notificationProjector
        ? await this.notificationProjector.reconcileConversationGroups(
            tx,
            access.workspaceId,
            [
              {
                conversationId,
                contactId: conversation.contactId,
                unreadCount,
              },
            ],
          )
        : [];
      return {
        count: messages.count,
        changed,
        unreadChanged: current.unreadCount !== unreadCount,
        unreadCount,
        watermark,
        invalidatedNotificationMemberIds,
      };
    });
    this.notificationPublisher?.invalidate(
      access.workspaceId,
      result.invalidatedNotificationMemberIds,
    );
    this.responseCache?.clearWorkspacePath(
      access.workspaceId,
      '/telegram-crm/contacts',
    );
    this.responseCache?.clearWorkspacePath(
      access.workspaceId,
      `/telegram-crm/conversations/${conversationId}/messages`,
    );
    if (result.changed) {
      this.events.emit({
        type: 'readChanged',
        workspaceId: access.workspaceId,
        occurredAt: new Date().toISOString(),
        conversationId,
        contactId: conversation.contactId,
        ownerMemberId: conversation.contact?.ownerMemberId ?? null,
        unreadCount: result.unreadCount,
      });
      if (result.unreadChanged) {
        this.events.emit({
          type: 'conversation.unreadChanged',
          workspaceId: access.workspaceId,
          occurredAt: new Date().toISOString(),
          conversationId,
          contactId: conversation.contactId,
          ownerMemberId: conversation.contact?.ownerMemberId ?? null,
          unreadCount: result.unreadCount,
        });
      }
      if (!conversation.contactId) {
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
    }
    return {
      conversationId,
      lastReadInboxTelegramMessageId: result.watermark,
      readMessageCount: result.count,
      unreadCount: result.unreadCount,
    };
  }
  private async lockState(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    conversationId: string,
  ) {
    const rows = await tx.$queryRaw<
      Array<{
        unreadCount: number;
        lastReadInboxTelegramMessageId: number | null;
      }>
    >(Prisma.sql`
      SELECT "unreadCount", "lastReadInboxTelegramMessageId"
      FROM "TelegramCrmConversation"
      WHERE "id" = ${conversationId} AND "workspaceId" = ${workspaceId}
      FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('CRM Conversation not found');
    return rows[0];
  }
}
