import { ConflictException, Injectable, Optional } from '@nestjs/common';
import {
  Prisma,
  TelegramAdvertiserTaskPriority,
  type TelegramAdvertiserTask,
} from '@prisma/client';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { WorkspaceService } from '../../../common/workspace.service';
import {
  manualFingerprint,
  requireNewManualOperation,
} from '../telegram-crm/telegram-crm-manual-operation';
import { PrismaService } from '../../../prisma/prisma.service';
import { ResponseCacheService } from '../../../common/response-cache.service';
import { TelegramCrmEventHub } from '../telegram-crm/telegram-crm-event-hub.service';
import { TelegramCrmInternalNotificationProjector } from '../telegram-crm/telegram-crm-internal-notification-projector.service';
import {
  CompleteTelegramAdvertiserTaskDto,
  CreateTelegramAdvertiserTaskDto,
  SkipTelegramAdvertiserTaskDto,
  TelegramAdvertiserTasksQueryDto,
  UpdateTelegramAdvertiserTaskDto,
} from './dto';
import { crmTaskChanges } from './telegram-ad-sales-crm-task-changes';
import {
  mapCrmTask,
  syncCrmContactReminder,
} from './telegram-ad-sales-crm-task-schedule';
import {
  lockCrmTask,
  lockCrmTaskContact,
  validateCrmTaskLinks,
} from './telegram-ad-sales-crm-task-validation';

@Injectable()
export class TelegramAdSalesCrmTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly notifications: TelegramCrmInternalNotificationProjector,
    @Optional() private readonly events?: TelegramCrmEventHub,
    @Optional() private readonly cache?: ResponseCacheService,
    @Optional() private readonly authorization?: WorkspaceAuthorizationService,
  ) {}

  async list(
    userId: string,
    query: TelegramAdvertiserTasksQueryDto,
    ownerMemberId?: string,
  ) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const where: Prisma.TelegramAdvertiserTaskWhereInput = {
      workspaceId,
      ...(ownerMemberId ? { advertiser: { ownerMemberId } } : {}),
      ...(query.advertiserId ? { advertiserId: query.advertiserId } : {}),
      ...(query.assignedMemberId
        ? { assignedMemberId: query.assignedMemberId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.telegramAdvertiserTask.findMany({
        where,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.telegramAdvertiserTask.count({ where }),
    ]);
    return createPaginatedResponse(
      items.map(mapCrmTask),
      totalItems,
      pagination,
    );
  }

  async create(
    userId: string,
    advertiserId: string,
    dto: CreateTelegramAdvertiserTaskDto,
    manualOperationId?: string,
  ) {
    const workspaceId = await this.workspace(userId);
    let changed = false;
    let invalidatedRecipients: string[] = [];
    const task = await this.prisma.$transaction(async (tx) => {
      if (manualOperationId)
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId + ':' + manualOperationId}, 0))`,
        );
      const contact = await lockCrmTaskContact(tx, workspaceId, advertiserId);
      await this.requireEdit(userId, contact.ownerMemberId);
      const manualRequestFingerprint = manualOperationId
        ? manualFingerprint(userId, advertiserId, dto)
        : null;
      if (manualOperationId) {
        const receipt = await tx.telegramAdvertiserTask.findUnique({
          where: {
            workspaceId_manualOperationId: { workspaceId, manualOperationId },
          },
        });
        if (receipt) {
          if (receipt.manualRequestFingerprint !== manualRequestFingerprint)
            throw new ConflictException('MANUAL_OPERATION_CONFLICT');
          return receipt;
        }
        requireNewManualOperation(manualOperationId);
      }
      await validateCrmTaskLinks(tx, workspaceId, advertiserId, dto);
      // An exact repeat from Inbox must not create another occurrence or audit row.
      if (
        dto.type === 'FOLLOW_UP' &&
        typeof dto.metadata?.conversationId === 'string'
      ) {
        const current = await tx.telegramAdvertiserTask.findFirst({
          where: {
            workspaceId,
            advertiserId,
            type: 'FOLLOW_UP',
            status: { in: ['OPEN', 'IN_PROGRESS'] },
            assignedMemberId: dto.assignedMemberId,
            title: dto.title.trim(),
            dueAt: new Date(dto.dueAt),
            remindAt: dto.remindAt ? new Date(dto.remindAt) : null,
            snoozedUntil: null,
            metadata: {
              path: ['conversationId'],
              equals: dto.metadata.conversationId,
            },
          },
        });
        if (current) return current;
      }
      const created = await tx.telegramAdvertiserTask.create({
        data: {
          workspaceId,
          advertiserId,
          manualOperationId: manualOperationId ?? null,
          manualRequestFingerprint,
          saleId: dto.saleId ?? null,
          placementId: dto.placementId ?? null,
          assignedMemberId: dto.assignedMemberId,
          createdByUserId: userId,
          type: dto.type,
          priority: dto.priority ?? TelegramAdvertiserTaskPriority.NORMAL,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          dueAt: new Date(dto.dueAt),
          remindAt: dto.remindAt ? new Date(dto.remindAt) : null,
          metadata:
            (dto.metadata as Prisma.InputJsonValue | undefined) ??
            Prisma.JsonNull,
        },
      });
      await this.activity(tx, created, userId, 'FOLLOW_UP_CREATED');
      invalidatedRecipients = await this.refresh(tx, created, false);
      changed = true;
      return created;
    });
    if (changed) await this.afterChange(task, invalidatedRecipients);
    return mapCrmTask(task);
  }

  async update(
    userId: string,
    taskId: string,
    dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    const workspaceId = await this.workspace(userId);
    let changed = false;
    let invalidatedRecipients: string[] = [];
    const task = await this.prisma.$transaction(async (tx) => {
      const { task: existing, ownerMemberId } = await lockCrmTask(
        tx,
        workspaceId,
        taskId,
      );
      await this.requireEdit(userId, ownerMemberId);
      const reopening = dto.status === 'OPEN' || dto.status === 'IN_PROGRESS';
      if (
        !reopening &&
        existing.status !== 'OPEN' &&
        existing.status !== 'IN_PROGRESS' &&
        (dto.dueAt !== undefined ||
          dto.remindAt !== undefined ||
          dto.snoozedUntil !== undefined ||
          (dto.status !== undefined && dto.status !== existing.status))
      )
        throw new ConflictException(
          'A finished reminder must be explicitly reopened before changing its schedule',
        );
      const data = crmTaskChanges(existing, dto);
      if (!Object.keys(data).length) return existing;
      const remainsOpen =
        (dto.status ?? existing.status) === 'OPEN' ||
        (dto.status ?? existing.status) === 'IN_PROGRESS';
      if (remainsOpen || dto.assignedMemberId !== undefined)
        await validateCrmTaskLinks(tx, workspaceId, existing.advertiserId, {
          ...existing,
          ...(!remainsOpen ? { metadata: undefined } : {}),
          status: dto.status ?? existing.status,
          assignedMemberId: dto.assignedMemberId ?? existing.assignedMemberId,
        });
      const updated = await tx.telegramAdvertiserTask.update({
        where: { id: taskId, workspaceId },
        data,
      });
      invalidatedRecipients = await this.refresh(tx, updated);
      changed = true;
      return updated;
    });
    if (changed) await this.afterChange(task, invalidatedRecipients);
    return mapCrmTask(task);
  }

  async complete(
    userId: string,
    taskId: string,
    dto: CompleteTelegramAdvertiserTaskDto,
  ) {
    return this.finish(
      userId,
      taskId,
      'COMPLETED',
      dto.completionNote?.trim() || null,
    );
  }

  snooze(userId: string, taskId: string, dto: UpdateTelegramAdvertiserTaskDto) {
    return this.update(userId, taskId, dto);
  }

  async skip(
    userId: string,
    taskId: string,
    dto: SkipTelegramAdvertiserTaskDto,
  ) {
    return this.finish(userId, taskId, 'SKIPPED', dto.reason?.trim() || null);
  }

  private async finish(
    userId: string,
    taskId: string,
    status: 'COMPLETED' | 'SKIPPED',
    note: string | null,
  ) {
    const workspaceId = await this.workspace(userId);
    let changed = false;
    let invalidatedRecipients: string[] = [];
    const task = await this.prisma.$transaction(async (tx) => {
      const { task: existing, ownerMemberId } = await lockCrmTask(
        tx,
        workspaceId,
        taskId,
      );
      await this.requireEdit(userId, ownerMemberId);
      if (existing.status === status) return existing;
      if (existing.status !== 'OPEN' && existing.status !== 'IN_PROGRESS')
        throw new ConflictException(
          'Only an open reminder can be completed or skipped',
        );
      const updated = await tx.telegramAdvertiserTask.update({
        where: { id: taskId, workspaceId },
        data: {
          status,
          ...(status === 'COMPLETED'
            ? { completedAt: new Date() }
            : { skippedAt: new Date() }),
          completionNote: note,
        },
      });
      await this.activity(
        tx,
        updated,
        userId,
        status === 'COMPLETED' ? 'FOLLOW_UP_COMPLETED' : 'FOLLOW_UP_SKIPPED',
        note,
      );
      invalidatedRecipients = await this.refresh(tx, updated);
      changed = true;
      return updated;
    });
    if (changed) await this.afterChange(task, invalidatedRecipients);
    return mapCrmTask(task);
  }

  private async requireEdit(userId: string, ownerMemberId: string | null) {
    await this.authorization?.requireOwnOrAny(
      userId,
      { assignedMemberId: ownerMemberId },
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    await this.authorization?.requireOwnOrAny(
      userId,
      { assignedMemberId: ownerMemberId },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
  }

  private workspace(userId: string) {
    return this.workspaces.resolveWorkspaceIdForUser(userId);
  }

  private async refresh(
    tx: Prisma.TransactionClient,
    task: TelegramAdvertiserTask,
    dismissPublished = true,
  ) {
    const recipients = dismissPublished
      ? await this.notifications.dismissPublishedTask(tx, task)
      : [];
    await this.notifications.refreshTask(tx, task);
    await syncCrmContactReminder(tx, task.workspaceId, task.advertiserId);
    return recipients;
  }

  private activity(
    tx: Prisma.TransactionClient,
    task: TelegramAdvertiserTask,
    userId: string,
    type: 'FOLLOW_UP_CREATED' | 'FOLLOW_UP_COMPLETED' | 'FOLLOW_UP_SKIPPED',
    description?: string | null,
  ) {
    return tx.telegramAdvertiserActivity.create({
      data: {
        workspaceId: task.workspaceId,
        advertiserId: task.advertiserId,
        saleId: task.saleId,
        placementId: task.placementId,
        taskId: task.id,
        actorUserId: userId,
        type,
        title: task.title,
        description: description ?? null,
        occurredAt: new Date(),
      },
    });
  }

  private async afterChange(
    task: TelegramAdvertiserTask,
    invalidatedRecipients: string[],
  ) {
    this.notifications.invalidateVisibility(
      task.workspaceId,
      invalidatedRecipients,
    );
    this.notifications.dueWorkChanged();
    this.cache?.clearWorkspacePath(task.workspaceId, '/telegram-crm/contacts');
    this.cache?.clearWorkspacePath(
      task.workspaceId,
      '/telegram-crm/conversations',
    );
    if (!this.events) return;
    const contact = await this.prisma.telegramAdvertiser.findFirst({
      where: { id: task.advertiserId, workspaceId: task.workspaceId },
      select: {
        ownerMemberId: true,
        nextContactAt: true,
        manualSalesStatus: true,
        archivedAt: true,
      },
    });
    this.events.emit({
      type: 'contact.updated',
      workspaceId: task.workspaceId,
      occurredAt: new Date().toISOString(),
      contactId: task.advertiserId,
      ownerMemberId: contact?.ownerMemberId ?? null,
      nextContactAt: contact?.nextContactAt?.toISOString() ?? null,
      manualSalesStatus: contact?.manualSalesStatus ?? null,
      archivedAt: contact?.archivedAt?.toISOString() ?? null,
    });
  }
}
