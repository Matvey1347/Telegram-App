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
  CreateAndDispatchTelegramPostBatchDto,
  CreateTelegramPostBatchDto,
  ImportTelegramPostBatchPostDto,
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

  async createDraft(userId: string, dto: CreateTelegramPostBatchDto) {
    const membership =
      await this.workspace.resolveWorkspaceMembershipForUser(userId);
    const channelIds = unique(dto.channelIds);
    if (channelIds.length !== dto.channelIds.length)
      throw postBatchInvalid('Channels must be unique');
    validateLimits(1, channelIds.length);
    await this.requireChannels(membership.workspaceId, channelIds);
    const created = await this.prisma.telegramPostBatch.create({
      data: {
        workspaceId: membership.workspaceId,
        createdByMemberId: membership.id,
        sourceWorkflowId: null,
        title:
          dto.title?.trim() ||
          `Mass publication · ${new Date().toISOString().slice(0, 10)}`,
        channelIds,
        defaultDeleteAfterHours: 24,
        posts: {
          create: {
            workspaceId: membership.workspaceId,
            position: 0,
            title: 'Post 1',
            iconId: null,
            text: null,
            imageUrls: [],
            mediaItems: [],
            buttonRows: [],
            action: TelegramPostBatchAction.PUBLISH_NOW,
            deleteAfterHours: 24,
            longTextMode: 'IMAGES_THEN_TEXT',
            channelOverrides: [],
          },
        },
      },
      select: { id: true },
    });
    return this.read.get(membership.workspaceId, created.id);
  }

  async createAndDispatch(
    userId: string,
    dto: CreateAndDispatchTelegramPostBatchDto,
  ) {
    const membership =
      await this.workspace.resolveWorkspaceMembershipForUser(userId);
    const workspaceId = membership.workspaceId;
    const channelIds = unique(dto.channelIds);
    if (channelIds.length !== dto.channelIds.length)
      throw postBatchInvalid('Channels must be unique');
    validateLimits(dto.posts.length, channelIds.length);
    if (!dto.posts.length || !channelIds.length)
      throw postBatchInvalid('Choose at least one post and one channel');
    await this.requireChannels(workspaceId, channelIds);
    await this.requireIcons(
      workspaceId,
      unique(dto.posts.flatMap((post) => (post.iconId ? [post.iconId] : []))),
    );
    const now = new Date();
    dto.posts.forEach((post) => validatePost(post, channelIds, now));
    const created = await this.prisma.telegramPostBatch.create({
      data: {
        workspaceId,
        createdByMemberId: membership.id,
        sourceWorkflowId: null,
        title: dto.title.trim(),
        channelIds,
        defaultDeleteAfterHours: dto.defaultDeleteAfterHours,
        posts: {
          create: dto.posts.map((post, position) => ({
            workspaceId,
            position,
            title: post.title.trim(),
            iconId: post.iconId ?? null,
            text: post.text ?? null,
            imageUrls: post.imageUrls,
            mediaItems: normalizeTelegramPostMediaItems(
              post.mediaItems,
              post.imageUrls,
            ) as unknown as Prisma.InputJsonValue,
            buttonRows: normalizeTelegramPostButtonRows(
              post.buttonRows,
            ) as unknown as Prisma.InputJsonValue,
            action: post.action,
            scheduledAt:
              post.action === 'SCHEDULE' && post.scheduledAt
                ? new Date(post.scheduledAt)
                : null,
            deleteAfterHours: post.deleteAfterHours,
            longTextMode: post.longTextMode,
            channelOverrides: normalizedOverrides(post.channelOverrides),
          })),
        },
      },
      select: { id: true },
    });
    try {
      return await this.dispatcher.dispatch({
        workspaceId,
        memberId: membership.id,
        batchId: created.id,
        expectedVersion: 0,
      });
    } catch (error) {
      await this.prisma.telegramPostBatch.deleteMany({
        where: {
          id: created.id,
          workspaceId,
          status: TelegramPostBatchStatus.DRAFT,
        },
      });
      throw error;
    }
  }

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
        resultPostBatchPostId: null,
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
          kind: TelegramSystemBotWorkflowKind.POST_BATCH_IMPORT,
          status: TelegramSystemBotWorkflowStatus.COMPLETED,
          resultPostBatchPostId: null,
          postBatch: { is: null },
        },
        select: { id: true, payload: true },
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
          workspaceId,
          status: TelegramSystemBotWorkflowStatus.COMPLETED,
          resultPostBatchPostId: null,
        },
        data: { resultPostBatchPostId: postId },
      });
      if (consumed.count !== 1) throw postBatchConflict();
      await tx.telegramPostBatchPost.update({
        where: { id: postId },
        data: imported,
      });
    });
    return this.read.get(workspaceId, batchId);
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
    await this.requireIcons(
      workspaceId,
      unique(dto.posts.flatMap((post) => (post.iconId ? [post.iconId] : []))),
    );
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
            iconId: post.iconId ?? null,
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

  async addPost(userId: string, id: string) {
    const membership =
      await this.workspace.resolveWorkspaceMembershipForUser(userId);
    const batch = await this.prisma.telegramPostBatch.findFirst({
      where: {
        id,
        workspaceId: membership.workspaceId,
        status: TelegramPostBatchStatus.DRAFT,
      },
      select: {
        id: true,
        version: true,
        defaultDeleteAfterHours: true,
        posts: {
          orderBy: { position: 'desc' },
          take: 1,
          select: { position: true },
        },
        _count: { select: { posts: true } },
      },
    });
    if (!batch) throw postBatchNotFound();
    if (batch._count.posts >= TELEGRAM_POST_BATCH_MAX_POSTS)
      throw postBatchLimitExceeded(
        `One batch can contain at most ${TELEGRAM_POST_BATCH_MAX_POSTS} posts`,
      );
    await this.prisma.$transaction([
      this.prisma.telegramPostBatchPost.create({
        data: {
          workspaceId: membership.workspaceId,
          batchId: batch.id,
          position: (batch.posts[0]?.position ?? -1) + 1,
          title: `Post ${batch._count.posts + 1}`,
          iconId: null,
          text: null,
          imageUrls: [],
          mediaItems: [],
          buttonRows: [],
          action: TelegramPostBatchAction.PUBLISH_NOW,
          deleteAfterHours: batch.defaultDeleteAfterHours,
          longTextMode: 'IMAGES_THEN_TEXT',
          channelOverrides: [],
        },
      }),
      this.prisma.telegramPostBatch.update({
        where: { id: batch.id },
        data: { version: { increment: 1 } },
      }),
    ]);
    return this.read.get(membership.workspaceId, batch.id);
  }

  async removeDraft(userId: string, id: string) {
    const membership =
      await this.workspace.resolveWorkspaceMembershipForUser(userId);
    const removed = await this.prisma.telegramPostBatch.deleteMany({
      where: {
        id,
        workspaceId: membership.workspaceId,
        status: TelegramPostBatchStatus.DRAFT,
      },
    });
    if (removed.count !== 1) throw postBatchNotFound();
    return { success: true };
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

  private async requireIcons(workspaceId: string, ids: string[]) {
    if (!ids.length) return;
    const count = await this.prisma.icon.count({
      where: { id: { in: ids }, OR: [{ workspaceId }, { workspaceId: null }] },
    });
    if (count !== ids.length)
      throw postBatchInvalid('One or more icons are unavailable');
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
  post:
    | UpdateTelegramPostBatchDto['posts'][number]
    | CreateAndDispatchTelegramPostBatchDto['posts'][number],
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
