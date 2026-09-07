import { Injectable } from '@nestjs/common';
import {
  MutualPromotionWorkItem,
  MutualPromotionWorkKind,
} from '@prisma/client';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramManagedPostPublicationService } from '../../telegram/telegram-channels/telegram-managed-post-publication.service';
import { TelegramManagedPostRemoteDeletionService } from '../../telegram/telegram-channels/telegram-managed-post-remote-deletion.service';
import { MutualPromotionBoundaryService } from './mutual-promotion-boundary.service';
import {
  MutualPromotionFinishDeferredError,
  mutualPromotionRetryAt,
  refreshMutualPromotionFolderDueTimes,
  runMutualPromotionBounded,
} from './mutual-promotion-lifecycle.utils';

export type MutualPromotionLifecycleResult = {
  considered: number;
  processed: number;
  completed: number;
  retried: number;
  failed: number;
  nextDueAt: Date | null;
};

@Injectable()
export class MutualPromotionLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boundaries: MutualPromotionBoundaryService,
    private readonly publication: TelegramManagedPostPublicationService,
    private readonly remoteDeletion: TelegramManagedPostRemoteDeletionService,
  ) {}

  async nextDueAt(): Promise<Date | null> {
    const [ready, leased] = await Promise.all([
      this.prisma.mutualPromotionWorkItem.findFirst({
        where: { status: { in: ['PENDING', 'RETRY'] } },
        orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
        select: { nextAttemptAt: true },
      }),
      this.prisma.mutualPromotionWorkItem.findFirst({
        where: {
          status: 'PROCESSING',
          leaseExpiresAt: { not: null },
        },
        orderBy: [{ leaseExpiresAt: 'asc' }, { id: 'asc' }],
        select: { leaseExpiresAt: true },
      }),
    ]);
    const values = [ready?.nextAttemptAt, leased?.leaseExpiresAt].filter(
      (value): value is Date => Boolean(value),
    );
    return (
      values.sort((left, right) => left.getTime() - right.getTime())[0] ?? null
    );
  }

  async processDueActions(
    options: { now?: Date; limit?: number } = {},
  ): Promise<MutualPromotionLifecycleResult> {
    const now = options.now ?? new Date();
    const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
    const candidates = await this.prisma.mutualPromotionWorkItem.findMany({
      where: {
        OR: [
          { status: { in: ['PENDING', 'RETRY'] }, nextAttemptAt: { lte: now } },
          { status: 'PROCESSING', leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    });
    const claimedIds: string[] = [];
    const leaseExpiresAt = new Date(now.getTime() + 15 * 60_000);
    for (const candidate of candidates) {
      const claim = await this.prisma.mutualPromotionWorkItem.updateMany({
        where: {
          id: candidate.id,
          OR: [
            {
              status: { in: ['PENDING', 'RETRY'] },
              nextAttemptAt: { lte: now },
            },
            { status: 'PROCESSING', leaseExpiresAt: { lte: now } },
          ],
        },
        data: {
          status: 'PROCESSING',
          claimedAt: now,
          leaseExpiresAt,
          attemptCount: { increment: 1 },
        },
      });
      if (claim.count) claimedIds.push(candidate.id);
    }
    const work = await this.prisma.mutualPromotionWorkItem.findMany({
      where: { id: { in: claimedIds }, status: 'PROCESSING' },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    });
    const result = {
      considered: candidates.length,
      processed: work.length,
      completed: 0,
      retried: 0,
      failed: 0,
    };
    const starts = work.filter(
      (item) => item.kind === MutualPromotionWorkKind.CAPTURE_START_BASELINE,
    );
    const publishes = work.filter(
      (item) => item.kind === MutualPromotionWorkKind.PUBLISH_POST,
    );
    const finishes = work.filter(
      (item) => item.kind === MutualPromotionWorkKind.FINISH_FOLDER,
    );

    await runMutualPromotionBounded(starts, 4, (item) =>
      this.runOne(item, now, result),
    );
    await runMutualPromotionBounded(finishes, 2, (item) =>
      this.runOne(item, now, result),
    );
    await runMutualPromotionBounded(publishes, 4, (item) =>
      this.runOne(item, now, result),
    );

    await refreshMutualPromotionFolderDueTimes(this.prisma, [
      ...new Set(work.map((item) => item.folderId)),
    ]);
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return { ...result, nextDueAt: await this.nextDueAt() };
  }

  private async runOne(
    work: MutualPromotionWorkItem,
    now: Date,
    result: Pick<
      MutualPromotionLifecycleResult,
      'completed' | 'retried' | 'failed'
    >,
  ) {
    try {
      if (work.kind === MutualPromotionWorkKind.CAPTURE_START_BASELINE) {
        await this.boundaries.captureStart(work.folderId, now);
      } else if (work.kind === MutualPromotionWorkKind.PUBLISH_POST) {
        await this.publishPost(work, now);
      } else {
        await this.finishFolder(work, now);
      }
      await this.prisma.mutualPromotionWorkItem.update({
        where: { id: work.id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          claimedAt: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });
      result.completed += 1;
    } catch (error) {
      const deferred =
        error instanceof MutualPromotionFinishDeferredError ? error : null;
      const terminal = !deferred && work.attemptCount >= work.maxAttempts;
      await this.prisma.mutualPromotionWorkItem.update({
        where: { id: work.id },
        data: {
          status: terminal ? 'FAILED' : 'RETRY',
          nextAttemptAt: terminal
            ? work.nextAttemptAt
            : (deferred?.retryAt ??
              mutualPromotionRetryAt(now, work.attemptCount)),
          attemptCount: deferred ? { decrement: 1 } : undefined,
          claimedAt: null,
          leaseExpiresAt: null,
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      if (terminal) result.failed += 1;
      else result.retried += 1;
    }
  }

  private async publishPost(work: MutualPromotionWorkItem, now: Date) {
    if (!work.folderPostId) throw new Error('Publish work has no logical post');
    const folder = await this.prisma.mutualPromotionFolder.findUnique({
      where: { id: work.folderId },
      select: { status: true, endsAt: true },
    });
    if (
      !folder ||
      ['CANCELLED', 'DELETING', 'COMPLETED'].includes(folder.status) ||
      now >= folder.endsAt
    )
      return;
    const missingBoundaries =
      await this.prisma.mutualPromotionFolderParticipant.count({
        where: {
          folderId: work.folderId,
          OR: [
            { baselineCapturedAt: null },
            { subscribersAtStart: null },
            { inviteJoinedAtStart: null },
          ],
        },
      });
    if (missingBoundaries) {
      throw new Error('Participant start boundaries are not ready');
    }
    const deliveries = await this.prisma.mutualPromotionPostDelivery.findMany({
      where: {
        folderPostId: work.folderPostId,
        status: { in: ['PENDING', 'PUBLISHING', 'FAILED'] },
        managedPostId: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        telegramChannelId: true,
        managedPostId: true,
        managedPost: {
          select: {
            status: true,
            scheduleMode: true,
            scheduledAt: true,
            telegramMessageIds: true,
          },
        },
      },
    });
    const errors: string[] = [];
    await runMutualPromotionBounded(deliveries, 5, async (delivery) => {
      if (delivery.managedPost?.status === 'PUBLISHED') {
        await this.prisma.mutualPromotionPostDelivery.update({
          where: { id: delivery.id },
          data: { status: 'PUBLISHED', publishedAt: now, lastError: null },
        });
        return;
      }
      if (
        delivery.managedPost?.status === 'SCHEDULED' &&
        delivery.managedPost.scheduleMode === 'TELEGRAM_NATIVE'
      ) {
        await this.prisma.mutualPromotionPostDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: delivery.managedPost.scheduledAt ?? now,
            lastError: null,
          },
        });
        return;
      }
      await this.prisma.mutualPromotionPostDelivery.update({
        where: { id: delivery.id },
        data: { status: 'PUBLISHING', lastError: null },
      });
      try {
        await this.publication.publishManagedPost(
          delivery.workspaceId,
          delivery.telegramChannelId,
          delivery.managedPostId!,
        );
        await this.prisma.mutualPromotionPostDelivery.update({
          where: { id: delivery.id },
          data: { status: 'PUBLISHED', publishedAt: now, lastError: null },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        await this.prisma.mutualPromotionPostDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', lastError: message },
        });
      }
    });
    if (errors.length)
      throw new Error(
        `${errors.length} publication deliveries failed: ${errors[0]}`,
      );
  }

  private async finishFolder(work: MutualPromotionWorkItem, now: Date) {
    await this.boundaries.captureFinal(work.folderId, now);
    await this.prisma.mutualPromotionWorkItem.updateMany({
      where: {
        folderId: work.folderId,
        kind: MutualPromotionWorkKind.PUBLISH_POST,
        status: { in: ['PENDING', 'RETRY'] },
      },
      data: { status: 'CANCELLED', completedAt: now },
    });
    const unfinishedPublications =
      await this.prisma.mutualPromotionWorkItem.findMany({
        where: {
          folderId: work.folderId,
          kind: MutualPromotionWorkKind.PUBLISH_POST,
          status: 'PROCESSING',
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
        take: 1,
        select: { nextAttemptAt: true },
      });
    if (unfinishedPublications.length) {
      throw new MutualPromotionFinishDeferredError(
        new Date(
          Math.max(
            now.getTime() + 30_000,
            unfinishedPublications[0].nextAttemptAt.getTime(),
          ),
        ),
        unfinishedPublications.length,
      );
    }
    const deliveries = await this.prisma.mutualPromotionPostDelivery.findMany({
      where: {
        folderPost: { folderId: work.folderId },
        status: { notIn: ['DELETED', 'SKIPPED'] },
      },
      select: {
        id: true,
        workspaceId: true,
        managedPostId: true,
        managedPost: {
          select: {
            scheduleMode: true,
            telegramScheduledMessageIds: true,
            telegramMessageIds: true,
            telegramRemoteStatus: true,
          },
        },
      },
    });
    const remotelyPublished = deliveries.filter(
      (delivery) =>
        delivery.managedPostId &&
        (delivery.managedPost?.telegramMessageIds.length ||
          (delivery.managedPost?.scheduleMode === 'TELEGRAM_NATIVE' &&
            delivery.managedPost.telegramScheduledMessageIds.length) ||
          delivery.managedPost?.telegramRemoteStatus === 'AUTO_DELETED'),
    );
    const skipped = deliveries.filter(
      (delivery) => !remotelyPublished.includes(delivery),
    );
    if (skipped.length) {
      await this.prisma.mutualPromotionPostDelivery.updateMany({
        where: { id: { in: skipped.map((delivery) => delivery.id) } },
        data: { status: 'SKIPPED', deletedAt: now },
      });
    }
    if (remotelyPublished.length) {
      await this.prisma.mutualPromotionPostDelivery.updateMany({
        where: { id: { in: remotelyPublished.map((delivery) => delivery.id) } },
        data: { status: 'DELETING', lastError: null },
      });
      const deletion = await this.remoteDeletion.deletePublishedManagedPosts({
        workspaceId: remotelyPublished[0].workspaceId,
        managedPostIds: remotelyPublished.map(
          (delivery) => delivery.managedPostId!,
        ),
      });
      const deliveryByPost = new Map(
        remotelyPublished.map((delivery) => [
          delivery.managedPostId!,
          delivery.id,
        ]),
      );
      const successfulIds = deletion.results
        .filter((item) => item.success)
        .map((item) => deliveryByPost.get(item.postId))
        .filter((id): id is string => Boolean(id));
      const failed = deletion.results.filter((item) => !item.success);
      if (successfulIds.length) {
        await this.prisma.mutualPromotionPostDelivery.updateMany({
          where: { id: { in: successfulIds } },
          data: { status: 'DELETED', deletedAt: now, lastError: null },
        });
      }
      if (failed.length) {
        await this.prisma.mutualPromotionPostDelivery.updateMany({
          where: {
            id: {
              in: failed
                .map((item) => deliveryByPost.get(item.postId))
                .filter((id): id is string => Boolean(id)),
            },
          },
          data: {
            status: 'FAILED',
            lastError: 'Remote deletion failed; retry is scheduled',
          },
        });
        throw new Error(
          `${failed.length} remote deletions failed: ${failed[0].error}`,
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const folder = await tx.mutualPromotionFolder.findUnique({
        where: { id: work.folderId },
        select: { cancelledAt: true },
      });
      await tx.mutualPromotionFolder.update({
        where: { id: work.folderId },
        data: {
          status: folder?.cancelledAt ? 'CANCELLED' : 'COMPLETED',
          completedAt: now,
          nextDueAt: null,
        },
      });
    });
  }
}
