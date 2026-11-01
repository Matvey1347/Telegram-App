import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CrmFollowUpActionInput,
  CrmManualFollowUpInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramAdSalesCrmTasksService } from '../telegram-ad-sales/telegram-ad-sales-crm-tasks.service';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';
@Injectable()
export class TelegramCrmManualFollowUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: TelegramCrmLegacyAuthorizationService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly tasks: TelegramAdSalesCrmTasksService,
  ) {}
  async schedule(
    userId: string,
    contactId: string,
    input: CrmManualFollowUpInput,
  ) {
    await this.crm.requireReadContact(userId, contactId);
    const workspaceId = await this.crm.requireEditContact(userId, contactId),
      access = await this.authorization.require(userId, 'adSales.crm.view');
    const contact = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: contactId, workspaceId },
      select: { ownerMemberId: true },
    });
    if (!contact) throw new NotFoundException('CRM Contact not found');
    await this.tasks.create(
      userId,
      contactId,
      {
        type: 'FOLLOW_UP',
        title: input.title?.trim() || 'Instagram follow-up',
        dueAt: this.date(input.at),
        assignedMemberId: contact.ownerMemberId ?? access.memberId,
        metadata: { origin: 'MANUAL_INSTAGRAM', channel: 'INSTAGRAM' },
      },
      input.operationId,
    );
  }
  async act(
    userId: string,
    contactId: string,
    taskId: string,
    input: CrmFollowUpActionInput,
  ) {
    await this.crm.requireReadContact(userId, contactId);
    const workspaceId = await this.crm.requireEditContact(userId, contactId);
    const task = await this.prisma.telegramAdvertiserTask.findFirst({
      where: { id: taskId, workspaceId, advertiserId: contactId },
      select: { id: true, status: true },
    });
    if (!task)
      throw new NotFoundException('Reminder does not belong to this client');
    if (input.action === 'COMPLETE')
      return this.tasks.complete(userId, taskId, {});
    if (input.action === 'CANCEL') {
      if (task.status === 'CANCELLED') return;
      if (!['OPEN', 'IN_PROGRESS'].includes(task.status))
        throw new ConflictException('Only an open reminder can be cancelled');
      return this.tasks.update(userId, taskId, { status: 'CANCELLED' });
    }
    return this.tasks.update(
      userId,
      taskId,
      input.action === 'SNOOZE'
        ? { snoozedUntil: this.date(input.at) }
        : { dueAt: this.date(input.at), remindAt: null, snoozedUntil: null },
    );
  }
  private date(value?: string) {
    const at = value ? new Date(value) : null;
    if (!at || !Number.isFinite(at.getTime()))
      throw new BadRequestException('A valid reminder date is required');
    return at.toISOString();
  }
}
