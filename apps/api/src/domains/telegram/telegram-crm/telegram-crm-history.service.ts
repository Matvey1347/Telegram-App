import { Injectable, NotFoundException } from '@nestjs/common';
import type { CrmHistoryImportResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmBatchStoreService } from './telegram-crm-batch-store.service';
import { ImportCrmHistoryDto } from './telegram-crm-inbox.dto';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';

@Injectable()
export class TelegramCrmHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly batchStore: TelegramCrmBatchStoreService,
  ) {}

  async import(
    userId: string,
    conversationId: string,
    dto: ImportCrmHistoryDto,
  ): Promise<CrmHistoryImportResult> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const conversation = await this.prisma.telegramCrmConversation.findFirst({
      where: { id: conversationId, workspaceId: access.workspaceId },
      select: {
        id: true,
        contactId: true,
        mtprotoAccountId: true,
        telegramAccessHash: true,
        historyCursorTelegramMessageId: true,
        historyExhausted: true,
        peer: { select: { telegramUserId: true, username: true } },
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
    if (conversation.historyExhausted && !dto.beforeTelegramMessageId) {
      return {
        conversationId,
        imported: 0,
        scanned: 0,
        nextBeforeTelegramMessageId: null,
        exhausted: true,
      };
    }
    const history = await this.runtime.withAccountHandle(
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
        return handle.getHistory({
          telegramUserId: peer.telegramUserId,
          telegramAccessHash: peer.telegramAccessHash,
          beforeTelegramMessageId:
            dto.beforeTelegramMessageId ??
            conversation.historyCursorTelegramMessageId,
          limit: dto.limit ?? 50,
        });
      },
    );
    const stored = await this.batchStore.importHistory({
      workspaceId: access.workspaceId,
      accountId: conversation.mtprotoAccountId,
      conversation: {
        id: conversation.id,
        contactId: conversation.contactId,
      },
      messages: history.messages,
      nextBeforeTelegramMessageId: history.nextBeforeTelegramMessageId,
      exhausted: history.exhausted,
    });
    return {
      conversationId,
      imported: stored.imported,
      scanned: history.messages.length,
      nextBeforeTelegramMessageId: history.nextBeforeTelegramMessageId,
      exhausted: history.exhausted,
    };
  }
}
