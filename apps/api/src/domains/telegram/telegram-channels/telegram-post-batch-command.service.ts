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
  TELEGRAM_POST_BATCH_MAX_CHANNELS,
  TELEGRAM_POST_BATCH_MAX_DELIVERIES,
  TELEGRAM_POST_BATCH_MAX_POSTS,
} from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import type {
  LinkTelegramPostBatchDto,
  UpdateTelegramPostBatchDto,
} from './telegram-post-batch.dto';
import {
  postBatchConflict,
  postBatchInvalid,
  postBatchLimitExceeded,
  postBatchNotFound,
} from './telegram-post-batch.errors';
import { TelegramPostBatchReadService } from './telegram-post-batch-read.service';
import { TelegramPostBatchDispatchService } from './telegram-post-batch-dispatch.service';
import {
  parseImportedPostBatchContents,
  validatePostBatchContent,
} from './telegram-post-batch-content-policy';

@Injectable()
export class TelegramPostBatchCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly read: TelegramPostBatchReadService,
    private readonly dispatcher: TelegramPostBatchDispatchService,
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
        kind: TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
        status: TelegramSystemBotWorkflowStatus.COMPLETED,
      },
      select: { id: true, payload: true, completedAt: true },
    });
    if (!workflow)
      throw new NotFoundException(
        'Completed System Bot post batch import is unavailable',
      );
    const contents = parseImportedPostBatchContents(workflow.payload);
    if (!contents.length)
      throw postBatchInvalid('Imported posts are unavailable');
    if (contents.length > TELEGRAM_POST_BATCH_MAX_POSTS) {
      throw postBatchLimitExceeded(
        `One batch can contain at most ${TELEGRAM_POST_BATCH_MAX_POSTS} posts`,
      );
    }
    const createdAt = workflow.completedAt ?? new Date();
    try {
      const batch = await this.prisma.telegramPostBatch.create({
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

  async update(userId: string, id: string, dto: UpdateTelegramPostBatchDto) {
    const membership =
      await this.workspace.resolveWorkspaceMembershipForUser(userId);
    const workspaceId = membership.workspaceId;
    validateLimits(dto.posts.length, dto.channelIds.length);
    const channelIds = unique(dto.channelIds);
    if (channelIds.length !== dto.channelIds.length)
      throw postBatchInvalid('Channels must be unique');
    const current = await this.prisma.telegramPostBatch.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        status: true,
        version: true,
        posts: { select: { id: true } },
      },
    });
    if (!current) throw postBatchNotFound();
    if (current.status !== TelegramPostBatchStatus.DRAFT)
      throw postBatchConflict();
    const currentPostIds = new Set(current.posts.map((post) => post.id));
    const inputPostIds = new Set(dto.posts.map((post) => post.id));
    if (
      inputPostIds.size !== dto.posts.length ||
      inputPostIds.size !== currentPostIds.size ||
      [...inputPostIds].some((postId) => !currentPostIds.has(postId))
    ) {
      throw postBatchInvalid(
        'Every imported post must be provided exactly once',
      );
    }
    await this.requireChannels(workspaceId, channelIds);
    const now = new Date();
    dto.posts.forEach((post) => validatePost(post, channelIds, now));
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.telegramPostBatch.updateMany({
        where: {
          id,
          workspaceId,
          status: TelegramPostBatchStatus.DRAFT,
          version: dto.expectedVersion,
        },
        data: {
          title: dto.title.trim(),
          channelIds,
          defaultDeleteAfterHours: dto.defaultDeleteAfterHours,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) throw postBatchConflict();
      for (let position = 0; position < dto.posts.length; position += 1) {
        const post = dto.posts[position];
        const mediaItems = normalizeTelegramPostMediaItems(
          post.mediaItems,
          post.imageUrls,
        );
        await tx.telegramPostBatchPost.update({
          where: { id: post.id },
          data: {
            position,
            title: post.title.trim(),
            text: post.text ?? null,
            imageUrls: post.imageUrls,
            mediaItems,
            buttonRows: normalizeTelegramPostButtonRows(post.buttonRows),
            action: post.action,
            scheduledAt:
              post.action === 'SCHEDULE' && post.scheduledAt
                ? new Date(post.scheduledAt)
                : null,
            deleteAfterHours: post.deleteAfterHours,
            longTextMode: post.longTextMode,
            channelOverrides: normalizedOverrides(post.channelOverrides),
          },
        });
      }
    });
    return this.read.get(workspaceId, id);
  }

  async dispatch(userId: string, id: string, expectedVersion: number) {
    const membership =
      await this.workspace.resolveWorkspaceMembershipForUser(userId);
    return this.dispatcher.dispatch({
      workspaceId: membership.workspaceId,
      memberId: membership.id,
      batchId: id,
      expectedVersion,
    });
  }

  async link(userId: string, id: string, dto: LinkTelegramPostBatchDto) {
    const membership =
      await this.workspace.resolveWorkspaceMembershipForUser(userId);
    const workspaceId = membership.workspaceId;
    await this.read.requireBatch(workspaceId, id);
    if (dto.type === 'AD_SALE') {
      const target = await this.prisma.telegramAdSale.findFirst({
        where: { id: dto.entityId, workspaceId },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Ad Sale not found');
      await this.prisma.telegramPostBatchAdSaleLink.upsert({
        where: { batchId_adSaleId: { batchId: id, adSaleId: target.id } },
        create: { workspaceId, batchId: id, adSaleId: target.id },
        update: {},
      });
    } else {
      const target = await this.prisma.mutualPromotionFolder.findFirst({
        where: { id: dto.entityId, workspaceId },
        select: { id: true },
      });
      if (!target)
        throw new NotFoundException('Mutual promotion folder not found');
      await this.prisma.telegramPostBatchMutualPromotionLink.upsert({
        where: {
          batchId_mutualPromotionFolderId: {
            batchId: id,
            mutualPromotionFolderId: target.id,
          },
        },
        create: {
          workspaceId,
          batchId: id,
          mutualPromotionFolderId: target.id,
        },
        update: {},
      });
    }
    return this.read.get(workspaceId, id);
  }

  private async requireChannels(workspaceId: string, ids: string[]) {
    if (!ids.length) return;
    const count = await this.prisma.telegramChannel.count({
      where: {
        id: { in: ids },
        workspaceId,
        isActive: true,
        archivedAt: null,
      },
    });
    if (count !== ids.length)
      throw new NotFoundException(
        'One or more Telegram channels are unavailable',
      );
  }
}

function validateLimits(postCount: number, channelCount: number) {
  if (postCount > TELEGRAM_POST_BATCH_MAX_POSTS)
    throw postBatchLimitExceeded(
      `One batch can contain at most ${TELEGRAM_POST_BATCH_MAX_POSTS} posts`,
    );
  if (channelCount > TELEGRAM_POST_BATCH_MAX_CHANNELS)
    throw postBatchLimitExceeded(
      `One batch can target at most ${TELEGRAM_POST_BATCH_MAX_CHANNELS} channels`,
    );
  if (postCount * channelCount > TELEGRAM_POST_BATCH_MAX_DELIVERIES)
    throw postBatchLimitExceeded(
      `One batch can queue at most ${TELEGRAM_POST_BATCH_MAX_DELIVERIES} deliveries`,
    );
}

function validatePost(
  post: UpdateTelegramPostBatchDto['posts'][number],
  channelIds: string[],
  now: Date,
) {
  const media = normalizeTelegramPostMediaItems(
    post.mediaItems,
    post.imageUrls,
  );
  validatePostBatchContent(post);
  if (!post.text?.trim() && !media.length)
    throw postBatchInvalid('Every post needs text or media');
  if (
    post.action === 'SCHEDULE' &&
    (!post.scheduledAt || new Date(post.scheduledAt).getTime() <= now.getTime())
  ) {
    throw postBatchInvalid('Scheduled publication times must be in the future');
  }
  const seen = new Set<string>();
  for (const override of post.channelOverrides) {
    if (
      seen.has(override.telegramChannelId) ||
      !channelIds.includes(override.telegramChannelId)
    ) {
      throw postBatchInvalid(
        'Channel overrides must be unique selected channels',
      );
    }
    seen.add(override.telegramChannelId);
    const action = override.action ?? post.action;
    const scheduledAt = override.scheduledAt ?? post.scheduledAt;
    if (
      action === 'SCHEDULE' &&
      (!scheduledAt || new Date(scheduledAt).getTime() <= now.getTime())
    ) {
      throw postBatchInvalid('Channel override schedule must be in the future');
    }
  }
}

function normalizedOverrides(
  overrides: UpdateTelegramPostBatchDto['posts'][number]['channelOverrides'],
) {
  return overrides.map((override) => ({
    telegramChannelId: override.telegramChannelId,
    ...(override.action ? { action: override.action } : {}),
    ...(override.scheduledAt !== undefined
      ? { scheduledAt: override.scheduledAt }
      : {}),
  }));
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
