import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramCrmMessageDirection,
  TelegramCrmReadState,
} from '@prisma/client';
import type { CrmConversationReadResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';

@Injectable()
export class TelegramCrmReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly events: TelegramCrmEventHub,
  ) {}

  async markRead(
    userId: string,
    conversationId: string,
  ): Promise<CrmConversationReadResult> {
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
            telegramMessageIdNumeric: { not: null },
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
      if (conversation.unreadCount > 0) {
        throw new BadRequestException(
          'Import current Telegram history before marking this Conversation read',
        );
      }
      return {
        conversationId,
        lastReadInboxTelegramMessageId:
          conversation.lastReadInboxTelegramMessageId,
        readMessageCount: 0,
        unreadCount: 0,
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
      const changed =
        conversation.lastReadInboxTelegramMessageId == null ||
        conversation.lastReadInboxTelegramMessageId < maxId ||
        conversation.unreadCount !== 0;
      if (changed) {
        await tx.telegramCrmConversation.update({
          where: { id: conversationId },
          data: {
            lastReadInboxTelegramMessageId: maxId,
            lastReadTelegramMessageId: String(maxId),
            lastReadAt: new Date(),
            unreadCount: 0,
            readState: TelegramCrmReadState.READ,
          },
        });
      }
      return {
        count: messages.count,
        changed,
        unreadChanged: conversation.unreadCount !== 0,
      };
    });
    if (result.changed) {
      this.events.emit({
        type: 'readChanged',
        workspaceId: access.workspaceId,
        occurredAt: new Date().toISOString(),
        conversationId,
        contactId: conversation.contactId,
        ownerMemberId: conversation.contact?.ownerMemberId ?? null,
        unreadCount: 0,
      });
      if (result.unreadChanged) {
        this.events.emit({
          type: 'conversation.unreadChanged',
          workspaceId: access.workspaceId,
          occurredAt: new Date().toISOString(),
          conversationId,
          contactId: conversation.contactId,
          ownerMemberId: conversation.contact?.ownerMemberId ?? null,
          unreadCount: 0,
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
      lastReadInboxTelegramMessageId: maxId,
      readMessageCount: result.count,
      unreadCount: 0,
    };
  }
}
