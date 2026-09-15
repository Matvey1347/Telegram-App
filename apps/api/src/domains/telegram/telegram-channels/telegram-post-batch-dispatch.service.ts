import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramPostBatchAction,
  TelegramPostBatchStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { requiresNativeTelegramRichMessage } from '../../../telegram/shared/telegram-markup';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import { managedPostRequiresBotApi } from './managed-post-publishing-source';
import { SYSTEM_BOT_POSTS_GROUP_KEY } from './telegram-channels.internal';
import {
  postBatchConflict,
  postBatchInvalid,
  postBatchNotFound,
} from './telegram-post-batch.errors';
import { TelegramPostBatchReadService } from './telegram-post-batch-read.service';
import { TelegramPostGroupStore } from './telegram-post-group.store';
import { postBatchSourceCapabilityFailure } from './telegram-post-batch-source-policy';
import { validatePostBatchContent } from './telegram-post-batch-content-policy';

const WRITE_CHUNK_SIZE = 250;

@Injectable()
export class TelegramPostBatchDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly read: TelegramPostBatchReadService,
    private readonly groups: TelegramPostGroupStore,
    private readonly sourceAccess: TelegramSourceAccessService,
  ) {}

  async dispatch(input: {
    workspaceId: string;
    memberId: string;
    batchId: string;
    expectedVersion: number;
  }) {
    const current = await this.prisma.telegramPostBatch.findFirst({
      where: { id: input.batchId, workspaceId: input.workspaceId },
      select: {
        id: true,
        status: true,
        version: true,
        channelIds: true,
        defaultDeleteAfterHours: true,
        _count: { select: { deliveries: true } },
        posts: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            iconId: true,
            text: true,
            imageUrls: true,
            mediaItems: true,
            buttonRows: true,
            action: true,
            scheduledAt: true,
            deleteAfterHours: true,
            longTextMode: true,
            channelOverrides: true,
          },
        },
      },
    });
    if (!current) throw postBatchNotFound();
    if (current.status !== TelegramPostBatchStatus.DRAFT) {
      return {
        batch: await this.read.get(input.workspaceId, input.batchId),
        queuedDeliveries: current._count.deliveries,
        alreadyQueued: true,
      };
    }
    if (current.version !== input.expectedVersion) throw postBatchConflict();
    if (!current.posts.length || !current.channelIds.length)
      throw postBatchInvalid('Choose at least one post and one channel');
    current.posts.forEach(validatePostBatchContent);
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        id: { in: current.channelIds },
        workspaceId: input.workspaceId,
        isActive: true,
        archivedAt: null,
      },
      select: { id: true, assignedMemberId: true },
    });
    if (channels.length !== current.channelIds.length)
      throw new NotFoundException(
        'One or more Telegram channels are unavailable',
      );

    const now = new Date();
    const deliveries = current.posts.flatMap((post) => {
      const overrides = new Map(
        parseOverrides(post.channelOverrides).map((override) => [
          override.telegramChannelId,
          override,
        ]),
      );
      return current.channelIds.map((channelId) => {
        const override = overrides.get(channelId);
        const action = override?.action ?? post.action;
        const scheduledAt =
          action === TelegramPostBatchAction.PUBLISH_NOW
            ? now
            : new Date(override?.scheduledAt ?? post.scheduledAt ?? 0);
        if (
          action === TelegramPostBatchAction.SCHEDULE &&
          scheduledAt.getTime() <= now.getTime()
        ) {
          throw postBatchInvalid(
            'Scheduled publication times must be in the future',
          );
        }
        return {
          id: randomUUID(),
          managedPostId: randomUUID(),
          post,
          channelId,
          action,
          scheduledAt,
          deleteAfterHours: post.deleteAfterHours,
          groupPosition: 0,
        };
      });
    });
    await this.preflight(input.workspaceId, deliveries);
    const existingGroups = await this.prisma.postGroup.findMany({
      where: {
        workspaceId: input.workspaceId,
        telegramChannelId: { in: current.channelIds },
        systemKey: SYSTEM_BOT_POSTS_GROUP_KEY,
      },
      select: { id: true, telegramChannelId: true },
    });
    const groupByChannel = new Map(
      existingGroups.map((group) => [group.telegramChannelId, group.id]),
    );
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.telegramPostBatch.updateMany({
        where: {
          id: input.batchId,
          workspaceId: input.workspaceId,
          status: TelegramPostBatchStatus.DRAFT,
          version: input.expectedVersion,
        },
        data: { status: TelegramPostBatchStatus.DISPATCHING },
      });
      if (claimed.count !== 1) throw postBatchConflict();
      for (const channel of channels) {
        if (groupByChannel.has(channel.id)) continue;
        const group = await this.groups.ensureSystemBotPostsGroup(
          tx,
          input.workspaceId,
          channel.id,
          channel.assignedMemberId ?? input.memberId,
        );
        groupByChannel.set(channel.id, group.id);
      }
      const groupPositions = await tx.telegramManagedPost.groupBy({
        by: ['groupId'],
        where: { groupId: { in: [...groupByChannel.values()] } },
        _max: { groupPosition: true },
      });
      const nextGroupPosition = new Map(
        groupPositions.flatMap((row) =>
          row.groupId
            ? [[row.groupId, (row._max.groupPosition ?? -1) + 1] as const]
            : [],
        ),
      );
      for (const delivery of deliveries) {
        const groupId = groupByChannel.get(delivery.channelId)!;
        delivery.groupPosition = nextGroupPosition.get(groupId) ?? 0;
        nextGroupPosition.set(groupId, delivery.groupPosition + 1);
      }
      for (const chunk of chunks(deliveries, WRITE_CHUNK_SIZE)) {
        await tx.telegramManagedPost.createMany({
          data: chunk.map((delivery) => ({
            id: delivery.managedPostId,
            workspaceId: input.workspaceId,
            telegramChannelId: delivery.channelId,
            title: delivery.post.title,
            icon: delivery.post.iconId,
            text: delivery.post.text,
            imageUrls: delivery.post.imageUrls,
            mediaItems: delivery.post.mediaItems as Prisma.InputJsonValue,
            buttonRows: delivery.post.buttonRows as Prisma.InputJsonValue,
            origin: 'SYSTEM',
            status: 'SCHEDULED',
            scheduledAt: delivery.scheduledAt,
            scheduleMode: 'BATCH',
            assignedMemberId: input.memberId,
            groupId: groupByChannel.get(delivery.channelId),
            groupPosition: delivery.groupPosition,
            jsonImportKey: `post-batch:${delivery.id}`,
          })),
        });
        await tx.telegramManagedPostRevision.createMany({
          data: chunk.map((delivery) => ({
            telegramManagedPostId: delivery.managedPostId,
            workspaceId: input.workspaceId,
            telegramChannelId: delivery.channelId,
            title: delivery.post.title,
            text: delivery.post.text,
            imageUrls: delivery.post.imageUrls,
            mediaItems: delivery.post.mediaItems as Prisma.InputJsonValue,
            buttonRows: delivery.post.buttonRows as Prisma.InputJsonValue,
            origin: 'SYSTEM',
            status: 'SCHEDULED',
            scheduledAt: delivery.scheduledAt,
            scheduleMode: 'BATCH',
            assignedMemberId: input.memberId,
            actorMemberId: input.memberId,
            groupId: groupByChannel.get(delivery.channelId),
            groupPosition: delivery.groupPosition,
            reason: 'post_batch_dispatched',
          })),
        });
        await tx.telegramPostBatchDelivery.createMany({
          data: chunk.map((delivery) => ({
            id: delivery.id,
            workspaceId: input.workspaceId,
            batchId: input.batchId,
            batchPostId: delivery.post.id,
            telegramChannelId: delivery.channelId,
            managedPostId: delivery.managedPostId,
            action: delivery.action,
            scheduledAt: delivery.scheduledAt,
            deleteAfterHours: delivery.deleteAfterHours,
            longTextMode:
              delivery.post.longTextMode === 'CAPTION_THEN_TEXT'
                ? 'CAPTION_THEN_TEXT'
                : 'IMAGES_THEN_TEXT',
            status: 'SCHEDULED',
            nextAttemptAt: delivery.scheduledAt,
          })),
        });
      }
      await tx.telegramPostBatch.update({
        where: { id: input.batchId },
        data: {
          status: TelegramPostBatchStatus.ACTIVE,
          dispatchedAt: now,
          version: { increment: 1 },
        },
      });
    });
    notifyScheduledTaskDueWorkChanged('telegram.post_batches.lifecycle');
    return {
      batch: await this.read.get(input.workspaceId, input.batchId),
      queuedDeliveries: deliveries.length,
      alreadyQueued: false,
    };
  }

  private async preflight(
    workspaceId: string,
    deliveries: Array<{
      channelId: string;
      deleteAfterHours: number | null;
      post: { text: string | null; buttonRows: unknown };
    }>,
  ) {
    const byChannel = new Map<
      string,
      { deleteAfterHours: number | null; requiresBotApi: boolean }
    >();
    for (const delivery of deliveries) {
      const previous = byChannel.get(delivery.channelId);
      const requiresBotApi = managedPostRequiresBotApi({
        hasInlineButtons: Boolean(
          normalizeTelegramPostButtonRows(delivery.post.buttonRows).length,
        ),
        requiresRichMessage: requiresNativeTelegramRichMessage(
          delivery.post.text ?? '',
        ),
        isAdvertisingPost: false,
      });
      byChannel.set(delivery.channelId, {
        deleteAfterHours:
          previous === undefined ||
          (delivery.deleteAfterHours ?? 0) > (previous.deleteAfterHours ?? 0)
            ? delivery.deleteAfterHours
            : previous.deleteAfterHours,
        requiresBotApi: Boolean(previous?.requiresBotApi || requiresBotApi),
      });
    }
    await mapBounded([...byChannel], 5, async ([channelId, requirement]) => {
      const sources = await this.sourceAccess.sourcesForChannel(
        workspaceId,
        channelId,
      );
      const failure = postBatchSourceCapabilityFailure({
        ...requirement,
        requiresPublishing: true,
        sources,
      });
      if (failure) throw postBatchInvalid(failure);
    });
  }
}

function parseOverrides(value: unknown): Array<{
  telegramChannelId: string;
  action?: TelegramPostBatchAction;
  scheduledAt?: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.telegramChannelId !== 'string') return [];
    return [
      {
        telegramChannelId: row.telegramChannelId,
        action:
          row.action === 'PUBLISH_NOW' || row.action === 'SCHEDULE'
            ? row.action
            : undefined,
        scheduledAt:
          typeof row.scheduledAt === 'string' ? row.scheduledAt : undefined,
      },
    ];
  });
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

async function mapBounded<T>(
  items: T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
) {
  for (let index = 0; index < items.length; index += concurrency)
    await Promise.all(items.slice(index, index + concurrency).map(work));
}
