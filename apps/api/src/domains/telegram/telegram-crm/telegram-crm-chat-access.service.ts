import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';
import type { TelegramCrmMtprotoHandle } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';

const conversationSelect = {
  id: true,
  workspaceId: true,
  mtprotoAccountId: true,
  contactId: true,
  telegramAccessHash: true,
  peer: { select: { telegramUserId: true, username: true } },
  contact: { select: { ownerMemberId: true, manualSalesStatus: true } },
  mtprotoAccount: {
    select: {
      crmSendEnabled: true,
      crmSyncEnabled: true,
      isActive: true,
      status: true,
    },
  },
} satisfies Prisma.TelegramCrmConversationSelect;
export type ChatConversation = Prisma.TelegramCrmConversationGetPayload<{
  select: typeof conversationSelect;
}>;

@Injectable()
export class TelegramCrmChatAccess {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly runtime: TelegramCrmRuntimeManager,
  ) {}
  async conversation(
    userId: string,
    id: string,
    mutate = false,
    commercial = false,
  ) {
    const access = await this.authorization.require(
      userId,
      mutate ? 'adSales.crm.sendManualMessages' : 'adSales.crm.view',
    );
    const row = await this.prisma.telegramCrmConversation.findFirst({
      where: { id, workspaceId: access.workspaceId },
      select: conversationSelect,
    });
    if (!row) throw new NotFoundException('CRM_CONVERSATION_NOT_FOUND');
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: row.contact?.ownerMemberId ?? null },
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    if (mutate)
      await this.authorization.requireOwnOrAny(
        userId,
        { assignedMemberId: row.contact?.ownerMemberId ?? null },
        'adSales.crm.editOwn',
        'adSales.crm.editAny',
      );
    if (commercial && row.contact?.manualSalesStatus === 'DO_NOT_CONTACT')
      throw new ForbiddenException('DO_NOT_CONTACT');
    return { row, access };
  }
  async withHandle<T>(
    userId: string,
    conversationId: string,
    mutate: boolean,
    commercial: boolean,
    operation: (
      handle: TelegramCrmMtprotoHandle,
      row: ChatConversation,
      peer: { telegramUserId: string; telegramAccessHash: string },
      memberId: string,
    ) => Promise<T>,
  ) {
    const initial = await this.conversation(
      userId,
      conversationId,
      mutate,
      commercial,
    );
    return this.runtime.withAccountHandle(
      initial.row.workspaceId,
      initial.row.mtprotoAccountId,
      mutate ? 'send' : 'sync',
      async (handle) => {
        // Re-read after potentially waiting for a session; ownership/DNC may change.
        await this.authorization.refresh(userId);
        const { row, access } = await this.conversation(
          userId,
          conversationId,
          mutate,
          commercial,
        );
        const peer = row.telegramAccessHash
          ? {
              telegramUserId: row.peer.telegramUserId,
              telegramAccessHash: row.telegramAccessHash,
            }
          : await handle.resolvePrivatePeer({
              telegramUserId: row.peer.telegramUserId,
              username: row.peer.username,
            });
        return operation(handle, row, peer, access.memberId);
      },
    );
  }
}
