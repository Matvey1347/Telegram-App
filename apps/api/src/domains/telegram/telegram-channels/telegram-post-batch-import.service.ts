import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramPostBatchAction,
  TelegramPostBatchStatus,
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import {
  normalizeTelegramPostMediaItems,
  TELEGRAM_POST_BATCH_MAX_POSTS,
} from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import type { ImportTelegramPostBatchPostDto } from './telegram-post-batch.dto';
import {
  postBatchConflict,
  postBatchInvalid,
  postBatchLimitExceeded,
  postBatchNotFound,
} from './telegram-post-batch.errors';
import { TelegramPostBatchReadService } from './telegram-post-batch-read.service';
import {
  parseImportedPostBatchContents,
  validatePostBatchContent,
} from './telegram-post-batch-content-policy';

@Injectable()
export class TelegramPostBatchImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly read: TelegramPostBatchReadService,
  ) {}

  async importWorkflow(userId: string, workflowId: string) {
    const membership =
      await this.workspace.resolveWorkspaceMembershipForUser(userId);
    const existing = await this.prisma.telegramPostBatch.findFirst({
      where: {
        sourceWorkflowId: workflowId,
        workspaceId: membership.workspaceId,
      },
      select: { id: true },
    });
    if (existing) return this.read.get(membership.workspaceId, existing.id);

    const workflow = await this.prisma.telegramSystemBotWorkflow.findFirst({
      where: {
        id: workflowId,
        workspaceId: membership.workspaceId,
        kind: TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
        postImportMode: 'MULTIPLE',
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
        consumedAt: null,
        resultPostBatchPostId: null,
        resultManagedPostId: null,
        resultAdSaleId: null,
        resultAdSalePlacementId: null,
        resultMutualPromotionPostId: null,
        postBatch: { is: null },
        connection: {
          is: { userId, enabled: true },
        },
      },
      select: {
        id: true,
        connectionId: true,
        payload: true,
        completedAt: true,
      },
    });
    if (!workflow)
      throw new NotFoundException(
        'Completed System Bot post batch import is unavailable',
      );
    const contents = parseImportedPostBatchContents(workflow.payload);
    if (!contents.length)
      throw postBatchInvalid('Imported posts are unavailable');
    if (contents.length > TELEGRAM_POST_BATCH_MAX_POSTS)
      throw postBatchLimitExceeded(
        `One batch can contain at most ${TELEGRAM_POST_BATCH_MAX_POSTS} posts`,
      );
    const createdAt = workflow.completedAt ?? new Date();
    try {
      const batch = await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.telegramSystemBotWorkflow.updateMany({
          where: {
            id: workflow.id,
            connectionId: workflow.connectionId,
            workspaceId: membership.workspaceId,
            connection: { is: { userId, enabled: true } },
            kind: TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
            postImportMode: 'MULTIPLE',
            status: TelegramSystemBotWorkflowStatus.COMPLETED,
            consumedAt: null,
            resultManagedPostId: null,
            resultPostBatchPostId: null,
            resultAdSaleId: null,
            resultAdSalePlacementId: null,
            resultMutualPromotionPostId: null,
            postBatch: { is: null },
          },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) throw postBatchConflict();
        return tx.telegramPostBatch.create({
          data: {
            workspaceId: membership.workspaceId,
            createdByMemberId: membership.id,
            sourceWorkflowId: workflow.id,
            title: `Post batch · ${createdAt.toISOString().slice(0, 10)}`,
            defaultDeleteAfterHours: 24,
            posts: {
              create: contents.map((content, position) => {
                const mediaItems = normalizeTelegramPostMediaItems(
                  content.mediaItems,
                  content.imageUrls,
                );
                const imported = {
                  workspaceId: membership.workspaceId,
                  position,
                  title:
                    content.title?.trim() ||
                    content.sourceTitle?.trim() ||
                    `Post ${position + 1}`,
                  iconId: null,
                  text: content.text ?? null,
                  imageUrls: content.imageUrls ?? [],
                  mediaItems: mediaItems as unknown as Prisma.InputJsonValue,
                  buttonRows: normalizeTelegramPostButtonRows(
                    content.buttonRows,
                  ) as unknown as Prisma.InputJsonValue,
                  action: TelegramPostBatchAction.PUBLISH_NOW,
                  deleteAfterHours: 24,
                  longTextMode: 'IMAGES_THEN_TEXT',
                  channelOverrides: [],
                };
                validatePostBatchContent(imported);
                return imported;
              }),
            },
          },
          select: { id: true },
        });
      });
      return this.read.get(membership.workspaceId, batch.id);
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const raced = await this.prisma.telegramPostBatch.findFirst({
        where: {
          sourceWorkflowId: workflowId,
          workspaceId: membership.workspaceId,
        },
        select: { id: true },
      });
      if (!raced) throw error;
      return this.read.get(membership.workspaceId, raced.id);
    }
  }

  async importPost(
    userId: string,
    batchId: string,
    postId: string,
    dto: ImportTelegramPostBatchPostDto,
  ) {
    const membership =
      await this.workspace.resolveWorkspaceMembershipForUser(userId);
    const workspaceId = membership.workspaceId;
    const [batch, workflow] = await Promise.all([
      this.prisma.telegramPostBatch.findFirst({
        where: { id: batchId, workspaceId },
        select: {
          id: true,
          status: true,
          version: true,
          posts: { where: { id: postId }, select: { id: true } },
        },
      }),
      this.prisma.telegramSystemBotWorkflow.findFirst({
        where: {
          id: dto.workflowId,
          workspaceId,
          kind: TelegramSystemBotWorkflowKind.WEBSITE_POST_IMPORT,
          postImportMode: 'SINGLE',
          status: TelegramSystemBotWorkflowStatus.COMPLETED,
          consumedAt: null,
          resultPostBatchPostId: null,
          resultManagedPostId: null,
          resultAdSaleId: null,
          resultAdSalePlacementId: null,
          resultMutualPromotionPostId: null,
          postBatch: { is: null },
          connection: {
            is: { userId, enabled: true },
          },
        },
        select: { id: true, connectionId: true, payload: true },
      }),
    ]);
    if (!batch || batch.posts.length !== 1) throw postBatchNotFound();
    if (
      batch.status !== TelegramPostBatchStatus.DRAFT ||
      batch.version !== dto.expectedVersion
    )
      throw postBatchConflict();
    if (!workflow)
      throw new NotFoundException(
        'Completed System Bot post import is unavailable',
      );
    const contents = parseImportedPostBatchContents(workflow.payload);
    if (contents.length !== 1)
      throw postBatchInvalid('Send exactly one post through the bot');
    const content = contents[0];
    const mediaItems = normalizeTelegramPostMediaItems(
      content.mediaItems,
      content.imageUrls,
    );
    const imported = {
      title: content.title?.trim() || content.sourceTitle?.trim() || 'Post',
      text: content.text ?? null,
      imageUrls: content.imageUrls ?? [],
      mediaItems: mediaItems as unknown as Prisma.InputJsonValue,
      buttonRows: normalizeTelegramPostButtonRows(
        content.buttonRows,
      ) as unknown as Prisma.InputJsonValue,
    };
    validatePostBatchContent(imported);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.telegramPostBatch.updateMany({
        where: {
          id: batchId,
          workspaceId,
          status: TelegramPostBatchStatus.DRAFT,
          version: dto.expectedVersion,
        },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) throw postBatchConflict();
      const consumed = await tx.telegramSystemBotWorkflow.updateMany({
        where: {
          id: workflow.id,
          connectionId: workflow.connectionId,
          workspaceId,
          connection: { is: { userId, enabled: true } },
          status: TelegramSystemBotWorkflowStatus.COMPLETED,
          consumedAt: null,
          resultPostBatchPostId: null,
          resultManagedPostId: null,
          resultAdSaleId: null,
          resultAdSalePlacementId: null,
          resultMutualPromotionPostId: null,
          postBatch: { is: null },
        },
        data: { resultPostBatchPostId: postId, consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw postBatchConflict();
      await tx.telegramPostBatchPost.update({
        where: { id: postId },
        data: imported,
      });
    });
    return this.read.get(workspaceId, batchId);
  }
}

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
