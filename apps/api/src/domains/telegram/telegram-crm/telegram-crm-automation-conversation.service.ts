import { Injectable } from '@nestjs/common';
import { Prisma, TelegramCrmConversationState } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { isPrismaUniqueConflict } from './telegram-crm-prisma-errors';

export type CrmAutomationEnvelopeTarget = {
  conversationId: string;
  mtprotoAccountId: string;
  telegramUserId: string;
  telegramAccessHash: string | null;
  username: string | null;
};

const targetSelect = {
  id: true,
  mtprotoAccountId: true,
  telegramAccessHash: true,
  peer: { select: { telegramUserId: true, username: true } },
} satisfies Prisma.TelegramCrmConversationSelect;

@Injectable()
export class TelegramCrmAutomationConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(params: {
    workspaceId: string;
    contactId: string;
    dealId: string;
    pinnedConversationId?: string | null;
    pinnedAccountId?: string | null;
  }): Promise<CrmAutomationEnvelopeTarget | null> {
    if (params.pinnedConversationId || params.pinnedAccountId) {
      if (!params.pinnedConversationId || !params.pinnedAccountId) return null;
      const pinned = await this.prisma.telegramCrmConversation.findFirst({
        where: {
          id: params.pinnedConversationId,
          workspaceId: params.workspaceId,
          contactId: params.contactId,
          mtprotoAccountId: params.pinnedAccountId,
          state: TelegramCrmConversationState.ACTIVE,
        },
        select: targetSelect,
      });
      return pinned ? this.map(pinned) : null;
    }

    const deal = await this.prisma.telegramAdSale.findFirst({
      where: {
        id: params.dealId,
        workspaceId: params.workspaceId,
        advertiserId: params.contactId,
      },
      select: { crmConversationId: true },
    });
    if (!deal) return null;
    if (deal.crmConversationId) {
      const explicit = await this.prisma.telegramCrmConversation.findFirst({
        where: {
          id: deal.crmConversationId,
          workspaceId: params.workspaceId,
          contactId: params.contactId,
          state: TelegramCrmConversationState.ACTIVE,
        },
        select: targetSelect,
      });
      return explicit ? this.map(explicit) : null;
    }

    const existing = await this.prisma.telegramCrmConversation.findFirst({
      where: {
        workspaceId: params.workspaceId,
        contactId: params.contactId,
        state: TelegramCrmConversationState.ACTIVE,
      },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      select: targetSelect,
    });
    if (existing) return this.map(existing);

    const settings =
      await this.prisma.telegramAdCrmWorkspaceSettings.findUnique({
        where: { workspaceId: params.workspaceId },
        select: { defaultCrmSenderAccountId: true },
      });
    if (!settings?.defaultCrmSenderAccountId) return null;
    const [account, peer] = await Promise.all([
      this.prisma.telegramUserAccountIntegration.findFirst({
        where: {
          id: settings.defaultCrmSenderAccountId,
          workspaceId: params.workspaceId,
          crmSendEnabled: true,
          isActive: true,
          status: 'connected',
          sessionEncrypted: { not: null },
          sessionIv: { not: null },
          sessionAuthTag: { not: null },
        },
        select: { id: true },
      }),
      this.prisma.telegramCrmPeer.findFirst({
        where: { workspaceId: params.workspaceId, contactId: params.contactId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, telegramUserId: true },
      }),
    ]);
    if (!account || !peer || !/^\d+$/.test(peer.telegramUserId)) return null;
    try {
      const created = await this.prisma.telegramCrmConversation.create({
        data: {
          workspaceId: params.workspaceId,
          telegramCrmPeerId: peer.id,
          contactId: params.contactId,
          mtprotoAccountId: account.id,
          telegramDialogId: peer.telegramUserId,
        },
        select: targetSelect,
      });
      return this.map(created);
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) throw error;
      const raced = await this.prisma.telegramCrmConversation.findFirst({
        where: {
          workspaceId: params.workspaceId,
          telegramCrmPeerId: peer.id,
          mtprotoAccountId: account.id,
          contactId: params.contactId,
          state: TelegramCrmConversationState.ACTIVE,
        },
        select: targetSelect,
      });
      return raced ? this.map(raced) : null;
    }
  }

  private map(
    row: Prisma.TelegramCrmConversationGetPayload<{
      select: typeof targetSelect;
    }>,
  ) {
    return {
      conversationId: row.id,
      mtprotoAccountId: row.mtprotoAccountId,
      telegramUserId: row.peer.telegramUserId,
      telegramAccessHash: row.telegramAccessHash,
      username: row.peer.username,
    };
  }
}
