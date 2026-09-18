import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE_ERROR_CODE } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  CreateTelegramSystemBotWorkflowInput,
  TelegramSystemBotWorkflowResultIds,
  TelegramSystemBotWorkflowScope,
  TransitionTelegramSystemBotWorkflowInput,
} from './telegram-system-bot-workflow.types';
import { withSystemBotInteractionLock } from './telegram-system-bot-interaction-lock';

type VersionedWorkflowInput = TelegramSystemBotWorkflowScope & {
  id: string;
  expectedVersion: number;
};

@Injectable()
export class TelegramSystemBotWorkflowStore {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateTelegramSystemBotWorkflowInput) {
    return withSystemBotInteractionLock(this.prisma, input, async (tx) => {
      await tx.telegramSystemBotWorkflow.updateMany({
        where: {
          connectionId: input.connectionId,
          workspaceId: input.workspaceId,
          status: TelegramSystemBotWorkflowStatus.ACTIVE,
          expiresAt: { lte: new Date() },
        },
        data: {
          status: TelegramSystemBotWorkflowStatus.EXPIRED,
          version: { increment: 1 },
        },
      });
      const active = await tx.telegramSystemBotWorkflow.findFirst({
        where: {
          connectionId: input.connectionId,
          workspaceId: input.workspaceId,
          status: TelegramSystemBotWorkflowStatus.ACTIVE,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (active) this.throwActiveImportConflict();
      if (
        input.kind === TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT ||
        input.kind === TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT
      ) {
        const finance = await tx.telegramSystemBotFinanceDraft.findFirst({
          where: {
            connectionId: input.connectionId,
            workspaceId: input.workspaceId,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (finance) this.throwActiveImportConflict();
      }
      return tx.telegramSystemBotWorkflow.create({
        data: {
          connectionId: input.connectionId,
          workspaceId: input.workspaceId,
          kind: input.kind,
          postImportMode: input.postImportMode ?? null,
          step: input.step,
          payload: input.payload,
          controlMessageId: input.controlMessageId ?? null,
          mutualPromotionFolderId: input.mutualPromotionFolderId ?? null,
          expiresAt: input.expiresAt,
        },
      });
    });
  }

  active(
    scope: TelegramSystemBotWorkflowScope,
    kind?: TelegramSystemBotWorkflowKind,
  ) {
    return this.prisma.telegramSystemBotWorkflow.findFirst({
      where: {
        connectionId: scope.connectionId,
        workspaceId: scope.workspaceId,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        ...(kind ? { kind } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async requireNoActivePostImport(scope: TelegramSystemBotWorkflowScope) {
    const active = await this.prisma.telegramSystemBotWorkflow.findFirst({
      where: {
        connectionId: scope.connectionId,
        workspaceId: scope.workspaceId,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        kind: {
          in: [
            TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
            TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
          ],
        },
      },
      select: { id: true },
    });
    if (!active) return;
    this.throwActiveImportConflict();
  }

  async activeWithoutPostImport(
    scope: TelegramSystemBotWorkflowScope,
    kind: TelegramSystemBotWorkflowKind,
  ) {
    await this.requireNoActivePostImport(scope);
    return this.active(scope, kind);
  }

  async get(scope: TelegramSystemBotWorkflowScope, id: string) {
    const workflow = await this.prisma.telegramSystemBotWorkflow.findFirst({
      where: {
        id,
        connectionId: scope.connectionId,
        workspaceId: scope.workspaceId,
      },
    });
    if (!workflow)
      throw new NotFoundException('System Bot workflow is not available');
    if (
      workflow.status === TelegramSystemBotWorkflowStatus.ACTIVE &&
      workflow.expiresAt <= new Date()
    ) {
      await this.prisma.telegramSystemBotWorkflow.updateMany({
        where: {
          id,
          connectionId: scope.connectionId,
          workspaceId: scope.workspaceId,
          status: TelegramSystemBotWorkflowStatus.ACTIVE,
          version: workflow.version,
          expiresAt: { lte: new Date() },
        },
        data: {
          status: TelegramSystemBotWorkflowStatus.EXPIRED,
          version: { increment: 1 },
        },
      });
      throw new ConflictException('System Bot workflow has expired');
    }
    return workflow;
  }

  async transition(input: TransitionTelegramSystemBotWorkflowInput) {
    const updated = await this.prisma.telegramSystemBotWorkflow.updateMany({
      where: {
        id: input.id,
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        status: TelegramSystemBotWorkflowStatus.ACTIVE,
        version: input.expectedVersion,
        expiresAt: { gt: new Date() },
      },
      data: {
        step: input.step,
        payload: input.payload,
        ...(input.controlMessageId === undefined
          ? {}
          : { controlMessageId: input.controlMessageId }),
        version: { increment: 1 },
        lastError: null,
      },
    });
    this.assertUpdated(updated.count);
    return this.get(input, input.id);
  }

  cancel(input: VersionedWorkflowInput) {
    return this.changeStatus(input, {
      from: [
        TelegramSystemBotWorkflowStatus.ACTIVE,
        TelegramSystemBotWorkflowStatus.FAILED,
      ],
      to: TelegramSystemBotWorkflowStatus.CANCELLED,
      completedAt: new Date(),
    });
  }

  claimCommit(input: VersionedWorkflowInput) {
    return this.changeStatus(input, {
      from: [TelegramSystemBotWorkflowStatus.ACTIVE],
      to: TelegramSystemBotWorkflowStatus.COMMITTING,
      requireNotExpired: true,
      clearError: true,
    });
  }

  completeCapture(input: VersionedWorkflowInput) {
    return this.changeStatus(input, {
      from: [TelegramSystemBotWorkflowStatus.ACTIVE],
      to: TelegramSystemBotWorkflowStatus.COMPLETED,
      requireNotExpired: true,
      completedAt: new Date(),
      clearError: true,
    });
  }

  async websitePostImportMetadata(
    scope: TelegramSystemBotWorkflowScope,
    id: string,
  ) {
    const row = await this.prisma.telegramSystemBotWorkflow.findFirst({
      where: {
        id,
        connectionId: scope.connectionId,
        workspaceId: scope.workspaceId,
        kind: TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
      },
      select: {
        id: true,
        postImportMode: true,
        status: true,
        version: true,
        expiresAt: true,
      },
    });
    if (!row) throw new NotFoundException('Website post import is unavailable');
    return row;
  }

  expire(input: VersionedWorkflowInput) {
    return this.changeStatus(input, {
      from: [TelegramSystemBotWorkflowStatus.ACTIVE],
      to: TelegramSystemBotWorkflowStatus.EXPIRED,
      completedAt: new Date(),
    });
  }

  fail(input: VersionedWorkflowInput & { error: string }) {
    return this.changeStatus(input, {
      from: [TelegramSystemBotWorkflowStatus.COMMITTING],
      to: TelegramSystemBotWorkflowStatus.FAILED,
      error: input.error,
    });
  }

  recordManagedPost(input: VersionedWorkflowInput & { managedPostId: string }) {
    return this.changeStatus(input, {
      from: [TelegramSystemBotWorkflowStatus.COMMITTING],
      to: TelegramSystemBotWorkflowStatus.COMMITTING,
      resultIds: { resultManagedPostId: input.managedPostId },
    });
  }

  retry(input: VersionedWorkflowInput) {
    return this.changeStatus(input, {
      from: [TelegramSystemBotWorkflowStatus.FAILED],
      to: TelegramSystemBotWorkflowStatus.ACTIVE,
      requireNotExpired: true,
      clearError: true,
    });
  }

  complete(input: VersionedWorkflowInput & TelegramSystemBotWorkflowResultIds) {
    return this.changeStatus(input, {
      from: [TelegramSystemBotWorkflowStatus.COMMITTING],
      to: TelegramSystemBotWorkflowStatus.COMPLETED,
      completedAt: new Date(),
      resultIds: input,
      clearError: true,
    });
  }

  private async changeStatus(
    input: VersionedWorkflowInput,
    transition: {
      from: TelegramSystemBotWorkflowStatus[];
      to: TelegramSystemBotWorkflowStatus;
      requireNotExpired?: boolean;
      completedAt?: Date;
      error?: string;
      clearError?: boolean;
      resultIds?: TelegramSystemBotWorkflowResultIds;
    },
  ) {
    const updated = await this.prisma.telegramSystemBotWorkflow.updateMany({
      where: {
        id: input.id,
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        status: { in: transition.from },
        version: input.expectedVersion,
        ...(transition.requireNotExpired
          ? { expiresAt: { gt: new Date() } }
          : {}),
      },
      data: {
        status: transition.to,
        version: { increment: 1 },
        ...(transition.completedAt
          ? { completedAt: transition.completedAt }
          : {}),
        ...(transition.error === undefined
          ? transition.clearError
            ? { lastError: null }
            : {}
          : { lastError: transition.error.slice(0, 1_000) }),
        ...(transition.resultIds
          ? {
              resultManagedPostId:
                transition.resultIds.resultManagedPostId ?? null,
              resultAdSaleId: transition.resultIds.resultAdSaleId ?? null,
              resultAdSalePlacementId:
                transition.resultIds.resultAdSalePlacementId ?? null,
            }
          : {}),
      },
    });
    this.assertUpdated(updated.count);
    return this.get(input, input.id);
  }

  private assertUpdated(count: number) {
    if (count !== 1) {
      throw new ConflictException(
        'System Bot workflow changed, expired, or is no longer active',
      );
    }
  }

  throwActiveImportConflict(): never {
    throw new ConflictException({
      code: TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE_ERROR_CODE,
      message: 'Finish the current post import before starting another one.',
    });
  }
}
