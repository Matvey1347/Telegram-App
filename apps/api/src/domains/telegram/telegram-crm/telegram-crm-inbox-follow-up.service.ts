import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CrmFollowUpActionInput,
  CrmScheduleFollowUpInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramAdSalesCrmTasksService } from '../telegram-ad-sales/telegram-ad-sales-crm-tasks.service';

/** Inbox adapter over the canonical task commands; there is no second scheduler. */
@Injectable()
export class TelegramCrmInboxFollowUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly tasks: TelegramAdSalesCrmTasksService,
  ) {}

  async schedule(
    userId: string,
    conversationId: string,
    input: CrmScheduleFollowUpInput,
  ) {
    const context = await this.context(userId, conversationId, true);
    const at = this.date(input.at);
    await this.tasks.create(userId, context.contactId!, {
      type: 'FOLLOW_UP',
      title: input.title?.trim() || 'Follow-up',
      assignedMemberId: context.contact?.ownerMemberId ?? context.memberId,
      dueAt: at,
      metadata: { conversationId: context.id },
    });
  }

  async act(
    userId: string,
    conversationId: string,
    taskId: string,
    input: CrmFollowUpActionInput,
  ) {
    const context = await this.context(
      userId,
      conversationId,
      input.action === 'RESCHEDULE' || input.action === 'SNOOZE',
    );
    const task = await this.prisma.telegramAdvertiserTask.findFirst({
      where: {
        id: taskId,
        workspaceId: context.workspaceId,
        advertiserId: context.contactId!,
      },
      select: { id: true, status: true },
    });
    if (!task)
      throw new NotFoundException('Reminder does not belong to this client');
    if (input.action === 'COMPLETE') {
      await this.tasks.complete(userId, task.id, {});
      return;
    }
    if (input.action === 'CANCEL') {
      if (task.status === 'CANCELLED') return;
      if (task.status !== 'OPEN' && task.status !== 'IN_PROGRESS')
        throw new ConflictException('Only an open reminder can be cancelled');
      await this.tasks.update(userId, task.id, { status: 'CANCELLED' });
      return;
    }
    if (task.status !== 'OPEN' && task.status !== 'IN_PROGRESS')
      throw new ConflictException('Only an open reminder can be rescheduled');
    const at = this.date(input.at);
    await this.tasks.update(
      userId,
      task.id,
      input.action === 'SNOOZE'
        ? { snoozedUntil: at }
        : { dueAt: at, remindAt: null, snoozedUntil: null },
    );
  }

  private async context(
    userId: string,
    conversationId: string,
    requireActive: boolean,
  ) {
    const access = await this.authorization.require(userId, 'adSales.crm.view');
    const conversation = await this.prisma.telegramCrmConversation.findFirst({
      where: { id: conversationId, workspaceId: access.workspaceId },
      select: {
        id: true,
        workspaceId: true,
        contactId: true,
        state: true,
        contact: {
          select: {
            ownerMemberId: true,
            archivedAt: true,
            manualSalesStatus: true,
          },
        },
      },
    });
    if (!conversation)
      throw new NotFoundException('CRM Conversation not found');
    if (!conversation.contactId || !conversation.contact)
      throw new ConflictException(
        'Link a CRM client before scheduling follow-up',
      );
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: conversation.contact.ownerMemberId },
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: conversation.contact.ownerMemberId },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
    if (
      requireActive &&
      (conversation.state !== 'ACTIVE' ||
        conversation.contact.archivedAt ||
        ['CLOSED', 'DO_NOT_CONTACT'].includes(
          conversation.contact.manualSalesStatus ?? '',
        ))
    ) {
      throw new ConflictException(
        'Reopen this client and active conversation before scheduling follow-up',
      );
    }
    return { ...conversation, memberId: access.memberId };
  }

  private date(value: string | undefined) {
    const at = value ? new Date(value) : null;
    if (!at || !Number.isFinite(at.getTime()))
      throw new BadRequestException('A valid reminder date is required');
    return at.toISOString();
  }
}
