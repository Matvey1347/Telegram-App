import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramAdPlacementStatus, TelegramSourceType } from '@prisma/client';
import { completedAdvertisingPostUpdate } from '../telegram-channels/completed-advertising-managed-post';
import { adDeletionReadyWhere } from '../../operations/scheduled-tasks/due-work-predicates';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { RetryPlacementDeletionDto } from './dto';
import { calculateAdPlacementDeleteAt } from './domain/sales-text';
import {
  isTelegramMessageAlreadyAbsent,
  resolveAdPlacementDeletionMessageIds,
  selectAdPlacementDeletionSource,
} from './domain/deletion-source';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export async function deletePublishedPlacement(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'deletePlacementMessagesWithMtproto'
    | 'getSaleDetails'
    | 'notifyAdDeletionDueWorkChanged'
    | 'prisma'
    | 'reconcilePlacementMetrics'
    | 'sourceAccessService'
    | 'telegramBotApiClient'
    | 'telegramChannelAccessService'
  >,
  workspaceId: string,
  placementId: string,
  options: { notifyScheduler?: boolean } = {},
) {
  const placement = await operations.prisma.telegramAdSalePlacement.findFirst({
    where: { id: placementId, workspaceId },
    include: {
      managedPost: { include: { group: true } },
      telegramPost: true,
      telegramChannel: true,
    },
  });
  if (!placement) throw new NotFoundException('Telegram ad sale placement not found');
  const messageIds = resolveAdPlacementDeletionMessageIds(placement);
  if (!messageIds.length) {
    throw new BadRequestException('Managed post has no published telegram messages');
  }
  // Persist the latest locally synchronized counters before the remote
  // message disappears. The TelegramPost and its snapshots remain stored.
  const metrics = await operations.reconcilePlacementMetrics(workspaceId, placement.id);
  const sources = await operations.sourceAccessService.sourcesForChannel(
    workspaceId,
    placement.telegramChannelId,
  );
  const selectedSource = selectAdPlacementDeletionSource(
    sources,
    placement.managedPost ?? {
      sourceType: null,
      sourceId: null,
      publishedAt: placement.publishedAt,
    },
  );
  if (!selectedSource) {
    throw new BadRequestException('No connected source can delete this placement');
  }

  if (selectedSource.sourceType === TelegramSourceType.MTPROTO) {
    await operations.deletePlacementMessagesWithMtproto(
      workspaceId,
      placement.telegramChannel,
      selectedSource.sourceId,
      messageIds,
    );
  } else {
    const token = await operations.telegramChannelAccessService.botTokenForSource(
      workspaceId,
      selectedSource.sourceId,
    );
    if (!placement.telegramChannel.telegramChatId) {
      throw new BadRequestException('Channel has no Telegram chat id');
    }
    try {
      for (const messageId of messageIds) {
        await operations.telegramBotApiClient.deleteMessage(token, {
          chat_id: placement.telegramChannel.telegramChatId,
          message_id: Number(messageId),
        });
      }
    } catch (botError) {
      if (!isTelegramMessageAlreadyAbsent(botError)) {
        const mtprotoFallback = sources.find(
          (source) =>
            source.sourceType === TelegramSourceType.MTPROTO && source.permissions.canDeleteMessages,
        );
        if (!mtprotoFallback) {
          throw new BadRequestException(
            `Telegram could not delete the post: ${botError instanceof Error ? botError.message : 'Bot API request failed'}`,
          );
        }
        await operations.deletePlacementMessagesWithMtproto(
          workspaceId,
          placement.telegramChannel,
          mtprotoFallback.sourceId,
          messageIds,
        );
      }
    }
  }

  await operations.prisma.$transaction([
    ...(placement.managedPost
      ? [
          operations.prisma.telegramManagedPost.update({
            where: { id: placement.managedPost.id },
            data: completedAdvertisingPostUpdate(placement, new Date()),
          }),
        ]
      : []),
    operations.prisma.telegramAdSalePlacement.update({
      where: { id: placement.id },
      data: {
        deletedAt: new Date(),
        status: TelegramAdPlacementStatus.COMPLETED,
        completedAt: new Date(),
        lastDeletionAttemptAt: new Date(),
        lastDeletionError: null,
        actualViews24h: metrics.actualViews24h,
        actualViews48h: metrics.actualViews48h,
        actualViewsFinal: metrics.actualViewsFinal,
        actualReactionsFinal: metrics.actualReactionsFinal,
        actualCpm: metrics.actualCpm,
      },
    }),
  ]);
  if (options.notifyScheduler !== false) {
    operations.notifyAdDeletionDueWorkChanged();
  }
  return operations.getSaleDetails(workspaceId, placement.telegramAdSaleId);
}

export async function deletePlacementMessagesWithMtproto(
  operations: Pick<TelegramAdSalesOperations, 'encryptionService' | 'mtprotoClient' | 'prisma'>,
  workspaceId: string,
  channel: {
    telegramChatId: string | null;
    username: string | null;
    telegramAccessHash: string | null;
  },
  sourceId: string,
  messageIds: string[],
) {
  const account = await operations.prisma.telegramUserAccountIntegration.findFirst({
    where: { id: sourceId, workspaceId, isActive: true },
  });
  if (!account?.sessionEncrypted) {
    throw new BadRequestException('MTProto source is not connected');
  }
  const apiHash = operations.encryptionService.decrypt({
    encrypted: account.apiHashEncrypted,
    iv: account.apiHashIv,
    authTag: account.apiHashAuthTag,
  });
  const session = operations.encryptionService.decrypt({
    encrypted: account.sessionEncrypted,
    iv: account.sessionIv ?? '',
    authTag: account.sessionAuthTag ?? '',
  });
  try {
    await operations.mtprotoClient.deletePublishedMessages({
      apiId: account.apiId,
      apiHash,
      session,
      channel,
      messageIds,
    });
  } catch (error) {
    if (!isTelegramMessageAlreadyAbsent(error)) throw error;
  }
}

export async function retryDeletion(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'deletePublishedPlacement'
    | 'ensurePlacementBelongsToSale'
    | 'getSale'
    | 'notifyAdDeletionDueWorkChanged'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  saleId: string,
  placementId: string,
  _dto: RetryPlacementDeletionDto,
) {
  const workspaceId = await operations.workspace(userId);
  const placement = await operations.ensurePlacementBelongsToSale(workspaceId, saleId, placementId);
  if (placement.isPermanentSnapshot) {
    throw new BadRequestException('Permanent placement cannot use automatic deletion retry');
  }
  try {
    await operations.deletePublishedPlacement(workspaceId, placement.id);
  } catch (error) {
    await operations.prisma.telegramAdSalePlacement.update({
      where: { id: placement.id },
      data: {
        lastDeletionAttemptAt: new Date(),
        lastDeletionError: error instanceof Error ? error.message : 'Deletion failed',
      },
    });
    operations.notifyAdDeletionDueWorkChanged();
    throw error;
  }
  return operations.getSale(userId, saleId);
}

export async function processDueDeletionBatch(
  operations: Pick<
    TelegramAdSalesOperations,
    'deletePublishedPlacement' | 'notifyAdDeletionDueWorkChanged' | 'prisma'
  >,
  limit = 20,
) {
  const now = new Date();
  const items = await operations.prisma.telegramAdSalePlacement.findMany({
    where: adDeletionReadyWhere(now),
    orderBy: { plannedDeleteAt: 'asc' },
    take: Math.max(1, Math.min(100, limit)),
    select: {
      id: true,
      workspaceId: true,
      scheduledAt: true,
      publishedAt: true,
      plannedDeleteAt: true,
      deleteAfterHoursSnapshot: true,
      isPermanentSnapshot: true,
    },
  });
  let processed = 0;
  let failed = 0;
  let deferred = 0;
  for (const item of items) {
    try {
      const effectivePlannedDeleteAt = calculateAdPlacementDeleteAt({
        scheduledAt: item.scheduledAt,
        publishedAt: item.publishedAt,
        deleteAfterHoursSnapshot: item.deleteAfterHoursSnapshot,
        isPermanentSnapshot: item.isPermanentSnapshot,
      });
      if (effectivePlannedDeleteAt && effectivePlannedDeleteAt > now) {
        await operations.prisma.telegramAdSalePlacement.update({
          where: { id: item.id },
          data: {
            plannedDeleteAt: effectivePlannedDeleteAt,
            lastDeletionAttemptAt: null,
            lastDeletionError: null,
          },
        });
        deferred += 1;
        continue;
      }
      await operations.deletePublishedPlacement(item.workspaceId, item.id, {
        notifyScheduler: false,
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      await operations.prisma.telegramAdSalePlacement.update({
        where: { id: item.id },
        data: {
          lastDeletionAttemptAt: new Date(),
          lastDeletionError: error instanceof Error ? error.message : 'Deletion failed',
        },
      });
    }
  }
  if (processed || failed || deferred) operations.notifyAdDeletionDueWorkChanged();
  return { processed, failed };
}

export function notifyAdDeletionDueWorkChanged(_operations: unknown) {
  notifyScheduledTaskDueWorkChanged('telegram_ad_sales.due_deletions');
}
