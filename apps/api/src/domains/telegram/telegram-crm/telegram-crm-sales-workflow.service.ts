import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  deriveCrmSalesAttention,
  type CrmSalesStatusInput,
  type CrmSalesWorkflow,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { loadNextCrmFollowUp } from '../telegram-ad-sales/telegram-ad-sales-crm-task-schedule';

const workflowSelect = {
  id: true,
  workspaceId: true,
  contactId: true,
  state: true,
  lastInboundAt: true,
  lastOutboundAt: true,
  contact: {
    select: {
      id: true,
      ownerMemberId: true,
      manualSalesStatus: true,
      archivedAt: true,
      nextContactAt: true,
    },
  },
} satisfies Prisma.TelegramCrmConversationSelect;

@Injectable()
export class TelegramCrmSalesWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly events: TelegramCrmEventHub,
  ) {}

  async read(
    userId: string,
    conversationId: string,
  ): Promise<CrmSalesWorkflow> {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const scope = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const row = await this.prisma.telegramCrmConversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: access.workspaceId,
        ...('assignedMemberId' in scope
          ? { contact: { ownerMemberId: scope.assignedMemberId } }
          : {}),
      },
      select: workflowSelect,
    });
    if (!row) throw new NotFoundException('CRM conversation not found');
    const [next, editAny, editOwn] = await Promise.all([
      row.contactId
        ? loadNextCrmFollowUp(this.prisma, row.workspaceId, row.contactId)
        : null,
      this.authorization.can(userId, 'adSales.crm.editAny'),
      this.authorization.can(userId, 'adSales.crm.editOwn'),
    ]);
    const canEdit = Boolean(
      row.contact &&
      (editAny || (editOwn && row.contact.ownerMemberId === access.memberId)),
    );
    const manualStatus = row.contact?.manualSalesStatus ?? null;
    const nextContactAt =
      (next
        ? (next.snoozedUntil ?? next.remindAt ?? next.dueAt)
        : row.contact?.nextContactAt
      )?.toISOString() ?? null;
    const reason = !row.contactId
      ? 'UNLINKED'
      : row.state !== 'ACTIVE' || row.contact?.archivedAt
        ? 'INACTIVE'
        : manualStatus === 'DO_NOT_CONTACT' || manualStatus === 'CLOSED'
          ? manualStatus
          : null;
    return {
      conversationId: row.id,
      contactId: row.contactId,
      canEdit,
      manualStatus,
      conversationState: row.state,
      nextContactAt,
      attentionStatus: deriveCrmSalesAttention({
        state: row.state,
        manualStatus,
        archivedAt: row.contact?.archivedAt?.toISOString() ?? null,
        nextContactAt,
        lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
        lastOutboundAt: row.lastOutboundAt?.toISOString() ?? null,
      }),
      nextFollowUp: next
        ? {
            id: next.id,
            title: next.title,
            dueAt: next.dueAt.toISOString(),
            remindAt: next.remindAt?.toISOString() ?? null,
            snoozedUntil: next.snoozedUntil?.toISOString() ?? null,
            effectiveAt: (
              next.snoozedUntil ??
              next.remindAt ??
              next.dueAt
            ).toISOString(),
            assignedMemberId: next.assignedMemberId,
            status: next.status as 'OPEN' | 'IN_PROGRESS',
          }
        : null,
      commercialOutreachAllowed: reason === null,
      outreachBlockedReason: reason,
    };
  }

  async setStatus(
    userId: string,
    conversationId: string,
    input: CrmSalesStatusInput,
  ) {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const scope = await this.authorization.scope(
      userId,
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
    const visibility = await this.authorization.scope(
      userId,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    const ownerMemberId =
      'assignedMemberId' in scope
        ? scope.assignedMemberId
        : 'assignedMemberId' in visibility
          ? visibility.assignedMemberId
          : undefined;
    const changed = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.telegramCrmConversation.findFirst({
        where: { id: conversationId, workspaceId: access.workspaceId },
        select: { contactId: true },
      });
      if (!conversation)
        throw new NotFoundException('CRM conversation not found');
      if (!conversation.contactId)
        throw new BadRequestException(
          'Link a CRM client before changing sales status',
        );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "TelegramAdvertiser" WHERE "id" = ${conversation.contactId} AND "workspaceId" = ${access.workspaceId} FOR UPDATE`,
      );
      const contact = await tx.telegramAdvertiser.findFirst({
        where: {
          id: conversation.contactId,
          workspaceId: access.workspaceId,
          ...(ownerMemberId ? { ownerMemberId } : {}),
        },
        select: {
          id: true,
          ownerMemberId: true,
          manualSalesStatus: true,
          archivedAt: true,
          nextContactAt: true,
        },
      });
      if (!contact) throw new NotFoundException('CRM client not found');
      if (contact.manualSalesStatus === input.manualStatus) return null;
      const updated = await tx.telegramAdvertiser.update({
        where: { id: contact.id, workspaceId: access.workspaceId },
        data: { manualSalesStatus: input.manualStatus },
        select: {
          id: true,
          ownerMemberId: true,
          manualSalesStatus: true,
          archivedAt: true,
          nextContactAt: true,
        },
      });
      await tx.telegramAdvertiserActivity.create({
        data: {
          workspaceId: access.workspaceId,
          advertiserId: contact.id,
          actorUserId: userId,
          type: 'STATUS_CHANGED',
          title: 'Sales status changed',
          description: `${contact.manualSalesStatus ?? 'AUTOMATIC'} → ${input.manualStatus ?? 'AUTOMATIC'}`,
          occurredAt: new Date(),
        },
      });
      return updated;
    });
    if (changed)
      this.events.emit({
        type: 'contact.updated',
        workspaceId: access.workspaceId,
        contactId: changed.id,
        ownerMemberId: changed.ownerMemberId,
        occurredAt: new Date().toISOString(),
        manualSalesStatus: changed.manualSalesStatus,
        nextContactAt: changed.nextContactAt?.toISOString() ?? null,
        archivedAt: changed.archivedAt?.toISOString() ?? null,
      });
    return this.read(userId, conversationId);
  }
}
