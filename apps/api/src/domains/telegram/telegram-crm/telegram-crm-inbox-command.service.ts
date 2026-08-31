import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CrmInboxPromotionResult,
  CrmInboxStateResult,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  PromoteCrmInboxPeerDto,
  SetCrmInboxStateDto,
} from './telegram-crm-inbox.dto';
import { crmContactSelect, mapCrmContact } from './telegram-crm-contact.mapper';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';

const latestDate = (...values: Array<Date | null>) => {
  const timestamps = values.flatMap((value) =>
    value ? [value.getTime()] : [],
  );
  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
};

@Injectable()
export class TelegramCrmInboxCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly events: TelegramCrmEventHub,
  ) {}

  async promote(
    userId: string,
    peerId: string,
    dto: PromoteCrmInboxPeerDto,
  ): Promise<CrmInboxPromotionResult> {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.editAny',
    );
    const result = await this.prisma.$transaction(async (tx) => {
      const peer = await tx.telegramCrmPeer.findFirst({
        where: { id: peerId, workspaceId: access.workspaceId },
        select: {
          id: true,
          contactId: true,
          username: true,
          firstName: true,
          lastName: true,
          telegramUserId: true,
        },
      });
      if (!peer) throw new NotFoundException('CRM Inbox peer not found');
      if (peer.contactId)
        throw new ConflictException('CRM Inbox peer is already promoted');
      const signals = await tx.telegramCrmConversation.aggregate({
        where: {
          workspaceId: access.workspaceId,
          telegramCrmPeerId: peer.id,
        },
        _max: {
          lastMessageAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
        },
      });
      const displayName =
        [peer.firstName, peer.lastName].filter(Boolean).join(' ').trim() ||
        (peer.username
          ? `@${peer.username}`
          : `Telegram ${peer.telegramUserId}`);
      const contact = await tx.telegramAdvertiser.create({
        data: {
          workspaceId: access.workspaceId,
          displayName,
          telegramUsername: peer.username,
          stage: dto.stage,
          ownerMemberId: access.memberId,
          createdByUserId: userId,
          source: 'TELEGRAM_INBOX',
          automatedMessagesEnabled: false,
          automatedMessagesEnabledAt: null,
          lastContactAt: latestDate(
            signals._max.lastMessageAt,
            signals._max.lastInboundAt,
            signals._max.lastOutboundAt,
          ),
          lastInboundAt: signals._max.lastInboundAt,
          lastOutboundAt: signals._max.lastOutboundAt,
        },
        select: crmContactSelect,
      });
      const claimed = await tx.telegramCrmPeer.updateMany({
        where: {
          id: peer.id,
          workspaceId: access.workspaceId,
          contactId: null,
        },
        data: { contactId: contact.id },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('CRM Inbox peer is already promoted');
      }
      const linked = await tx.telegramCrmConversation.updateMany({
        where: {
          workspaceId: access.workspaceId,
          telegramCrmPeerId: peer.id,
          contactId: null,
        },
        data: { contactId: contact.id },
      });
      return { contact, linkedConversationCount: linked.count };
    });
    this.events.emit({
      type: 'contact.updated',
      workspaceId: access.workspaceId,
      occurredAt: new Date().toISOString(),
      contactId: result.contact.id,
      ownerMemberId: result.contact.ownerMemberId,
    });
    this.events.emit({
      type: 'inbox.updated',
      workspaceId: access.workspaceId,
      occurredAt: new Date().toISOString(),
      peerId,
      contactId: null,
      ownerMemberId: null,
      conversation: null,
    });
    return {
      contact: mapCrmContact(result.contact),
      peerId,
      linkedConversationCount: result.linkedConversationCount,
    };
  }

  async setState(
    userId: string,
    peerId: string,
    dto: SetCrmInboxStateDto,
  ): Promise<CrmInboxStateResult> {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.editAny',
    );
    const peer = await this.prisma.telegramCrmPeer.findFirst({
      where: { id: peerId, workspaceId: access.workspaceId, contactId: null },
      select: { id: true },
    });
    if (!peer) throw new NotFoundException('CRM Inbox peer not found');
    const changed = await this.prisma.telegramCrmConversation.updateMany({
      where: {
        workspaceId: access.workspaceId,
        telegramCrmPeerId: peer.id,
        NOT: { state: dto.state },
      },
      data: { state: dto.state },
    });
    if (changed.count) {
      this.events.emit({
        type: 'inbox.updated',
        workspaceId: access.workspaceId,
        occurredAt: new Date().toISOString(),
        peerId,
        contactId: null,
        ownerMemberId: null,
        conversation: null,
      });
    }
    return {
      peerId,
      state: dto.state,
      changedConversationCount: changed.count,
    };
  }
}
