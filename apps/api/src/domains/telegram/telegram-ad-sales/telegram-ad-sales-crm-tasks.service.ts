import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdvertiserActivityType,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
} from '@prisma/client';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmInternalNotificationProjector } from '../telegram-crm/telegram-crm-internal-notification-projector.service';
import {
  CompleteTelegramAdvertiserTaskDto,
  CreateTelegramAdvertiserTaskDto,
  SkipTelegramAdvertiserTaskDto,
  TelegramAdvertiserTasksQueryDto,
  UpdateTelegramAdvertiserTaskDto,
} from './dto';

@Injectable()
export class TelegramAdSalesCrmTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly notifications: TelegramCrmInternalNotificationProjector,
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
      items.map((item) => this.map(item)),
      totalItems,
      pagination,
    );
  }

  async create(
    userId: string,
    advertiserId: string,
    dto: CreateTelegramAdvertiserTaskDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const task = await this.prisma.$transaction(async (tx) => {
      await this.requireContact(tx, workspaceId, advertiserId);
      const created = await tx.telegramAdvertiserTask.create({
        data: {
          workspaceId,
          advertiserId,
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
      await this.notifications.refreshTask(tx, created);
      return created;
    });
    this.notifications.dueWorkChanged();
    return this.map(task);
  }

  async update(
    userId: string,
    taskId: string,
    dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const changedSchedule =
      dto.dueAt !== undefined ||
      dto.remindAt !== undefined ||
      dto.snoozedUntil !== undefined ||
      dto.status !== undefined ||
      dto.title !== undefined ||
      dto.priority !== undefined;
    const task = await this.prisma.$transaction(async (tx) => {
      const existing = await this.requireTask(tx, workspaceId, taskId);
      const updated = await tx.telegramAdvertiserTask.update({
        where: { id: taskId },
        data: {
          ...(dto.assignedMemberId === undefined
            ? {}
            : { assignedMemberId: dto.assignedMemberId }),
          ...(dto.status === undefined ? {} : { status: dto.status }),
          ...(dto.priority === undefined ? {} : { priority: dto.priority }),
          ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description?.trim() || null }),
          ...(dto.dueAt === undefined
            ? {}
            : { dueAt: dto.dueAt ? new Date(dto.dueAt) : existing.dueAt }),
          ...(dto.remindAt === undefined
            ? {}
            : { remindAt: dto.remindAt ? new Date(dto.remindAt) : null }),
          ...(dto.snoozedUntil === undefined
            ? {}
            : {
                snoozedUntil: dto.snoozedUntil
                  ? new Date(dto.snoozedUntil)
                  : null,
              }),
        },
      });
      if (changedSchedule) await this.notifications.refreshTask(tx, updated);
      return updated;
    });
    if (changedSchedule) this.notifications.dueWorkChanged();
    return this.map(task);
  }

  async complete(
    userId: string,
    taskId: string,
    dto: CompleteTelegramAdvertiserTaskDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const task = await this.prisma.$transaction(async (tx) => {
      const existing = await this.requireTask(tx, workspaceId, taskId);
      const updated = await tx.telegramAdvertiserTask.update({
        where: { id: taskId },
        data: {
          status: TelegramAdvertiserTaskStatus.COMPLETED,
          completedAt: existing.completedAt ?? new Date(),
          completionNote: dto.completionNote?.trim() || null,
        },
      });
      const activity = await tx.telegramAdvertiserActivity.findFirst({
        where: {
          workspaceId,
          advertiserId: updated.advertiserId,
          taskId,
          type: TelegramAdvertiserActivityType.FOLLOW_UP_COMPLETED,
        },
        select: { id: true },
      });
      if (!activity) {
        await this.activity(
          tx,
          updated,
          userId,
          'FOLLOW_UP_COMPLETED',
          dto.completionNote?.trim() || null,
        );
      }
      await this.notifications.refreshTask(tx, updated);
      return updated;
    });
    this.notifications.dueWorkChanged();
    return this.map(task);
  }

  snooze(userId: string, taskId: string, dto: UpdateTelegramAdvertiserTaskDto) {
    return this.update(userId, taskId, dto);
  }

  async skip(
    userId: string,
    taskId: string,
    dto: SkipTelegramAdvertiserTaskDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const task = await this.prisma.$transaction(async (tx) => {
      await this.requireTask(tx, workspaceId, taskId);
      const updated = await tx.telegramAdvertiserTask.update({
        where: { id: taskId },
        data: {
          status: TelegramAdvertiserTaskStatus.SKIPPED,
          skippedAt: new Date(),
          completionNote: dto.reason?.trim() || null,
        },
      });
      await this.activity(
        tx,
        updated,
        userId,
        'FOLLOW_UP_SKIPPED',
        dto.reason?.trim() || null,
      );
      await this.notifications.refreshTask(tx, updated);
      return updated;
    });
    this.notifications.dueWorkChanged();
    return this.map(task);
  }

  private workspace(userId: string) {
    return this.workspaces.resolveWorkspaceIdForUser(userId);
  }

  private async requireContact(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    id: string,
  ) {
    const contact = await tx.telegramAdvertiser.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundException('Telegram advertiser not found');
  }

  private async requireTask(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    id: string,
  ) {
    const task = await tx.telegramAdvertiserTask.findFirst({
      where: { id, workspaceId },
    });
    if (!task) {
      throw new NotFoundException('Telegram advertiser task not found');
    }
    return task;
  }

  private activity(
    tx: Prisma.TransactionClient,
    task: {
      id: string;
      workspaceId: string;
      advertiserId: string;
      saleId: string | null;
      placementId: string | null;
      title: string;
    },
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

  private map(task: any) {
    return {
      ...task,
      dueAt: task.dueAt.toISOString(),
      remindAt: task.remindAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      skippedAt: task.skippedAt?.toISOString() ?? null,
      snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
