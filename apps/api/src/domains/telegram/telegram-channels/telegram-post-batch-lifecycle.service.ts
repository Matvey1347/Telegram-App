import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramPostBatchDeliveryStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { TelegramManagedPostRemoteDeletionService } from './telegram-managed-post-remote-deletion.service';
import {
  groupPostBatchRows,
  runPostBatchByChannel,
  type ClaimedPostBatchDelivery,
} from './telegram-post-batch-lifecycle.utils';
import { TelegramPostBatchDueReadService } from './telegram-post-batch-due-read.service';
import { TelegramPostBatchStatusService } from './telegram-post-batch-status.service';
import { TelegramPostBatchClaimLeaseService } from './telegram-post-batch-claim-lease.service';
import {
  AmbiguousPostBatchPublicationError,
  TelegramPostBatchPublicationRunnerService,
} from './telegram-post-batch-publication-runner.service';

const CLAIM_MS = 5 * 60 * 1_000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
const CONCURRENCY = 5;

@Injectable()
export class TelegramPostBatchLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deletion: TelegramManagedPostRemoteDeletionService,
    private readonly due: TelegramPostBatchDueReadService,
    private readonly batchStatus: TelegramPostBatchStatusService,
    private readonly claimLease: TelegramPostBatchClaimLeaseService,
    private readonly publicationRunner: TelegramPostBatchPublicationRunnerService,
  ) {}

  async nextDueAt() {
    return this.due.nextDueAt();
  }

  async processDueActions(limit = BATCH_SIZE) {
    const now = new Date();
    const sourceCache = new Map<
      string,
      ReturnType<TelegramSourceAccessService['sourcesForChannel']>
    >();
    const publishClaims = await this.claimPublish(now, limit);
    await runPostBatchByChannel(publishClaims, CONCURRENCY, (delivery) =>
      this.publish(delivery, now, sourceCache),
    );
    const deletionClaims = await this.claimDeletion(now, limit);
    await this.remove(deletionClaims, now);
    const batchIds = [
      ...new Set(
        [...publishClaims, ...deletionClaims].map(
          (delivery) => delivery.batchId,
        ),
      ),
    ];
    await this.batchStatus.refreshMany(batchIds, this.prisma);
    await this.batchStatus.repairTerminalBatches();
    notifyScheduledTaskDueWorkChanged('telegram.post_batches.lifecycle');
    return {
      considered: publishClaims.length + deletionClaims.length,
      published: publishClaims.length,
      deleted: deletionClaims.length,
      nextDueAt: await this.nextDueAt(),
    };
  }

  private async claimPublish(now: Date, limit: number) {
    const candidates = await this.prisma.telegramPostBatchDelivery.findMany({
      where: {
        scheduledAt: { lte: now },
        OR: [
          {
            status: TelegramPostBatchDeliveryStatus.SCHEDULED,
            nextAttemptAt: { lte: now },
          },
          {
            status: TelegramPostBatchDeliveryStatus.FAILED,
            nextAttemptAt: { lte: now },
          },
          {
            status: TelegramPostBatchDeliveryStatus.PUBLISHING,
            claimExpiresAt: { lte: now },
          },
        ],
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      take: Math.min(limit, BATCH_SIZE),
      select: { id: true },
    });
    const owner = randomUUID();
    const expires = new Date(now.getTime() + CLAIM_MS);
    const claimed: string[] = [];
    for (const candidate of candidates) {
      const result = await this.prisma.telegramPostBatchDelivery.updateMany({
        where: {
          id: candidate.id,
          scheduledAt: { lte: now },
          OR: [
            {
              status: { in: ['SCHEDULED', 'FAILED'] },
              nextAttemptAt: { lte: now },
            },
            { status: 'PUBLISHING', claimExpiresAt: { lte: now } },
          ],
        },
        data: {
          status: 'PUBLISHING',
          claimOwner: owner,
          claimExpiresAt: expires,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          lastError: null,
        },
      });
      if (result.count) claimed.push(candidate.id);
    }
    return this.claimedRows(claimed, owner);
  }

  private async publish(
    delivery: ClaimedPostBatchDelivery,
    now: Date,
    sourceCache = new Map<
      string,
      ReturnType<TelegramSourceAccessService['sourcesForChannel']>
    >(),
  ) {
    const managed = delivery.managedPost;
    if (
      managed.telegramRemoteStatus ===
      TelegramManagedPostRemoteStatus.AUTO_DELETED
    ) {
      return this.markDeleted(delivery, now, 'PUBLISHING');
    }
    if (managed.status === TelegramManagedPostStatus.PUBLISHED) {
      return this.markPublished(
        delivery,
        managed.publishedAt ?? delivery.scheduledAt,
        delivery.deleteAfterHours,
      );
    }
    try {
      const lease = await this.publicationRunner.run(delivery, sourceCache);
      if (!lease.held) return;
      const published = lease.value;
      if (published?.status !== TelegramManagedPostStatus.PUBLISHED)
        throw new Error('Managed post publication was not confirmed');
      await this.markPublished(
        delivery,
        published.publishedAt ?? new Date(),
        delivery.deleteAfterHours,
      );
    } catch (error) {
      await this.markFailure(delivery, error, 'FAILED');
    }
  }

  private async claimDeletion(now: Date, limit: number) {
    const candidates = await this.prisma.telegramPostBatchDelivery.findMany({
      where: {
        deleteAt: { lte: now },
        OR: [
          { status: 'PUBLISHED' },
          { status: 'DELETE_FAILED', nextAttemptAt: { lte: now } },
          { status: 'DELETING', claimExpiresAt: { lte: now } },
        ],
      },
      orderBy: [{ deleteAt: 'asc' }, { id: 'asc' }],
      take: Math.min(limit, BATCH_SIZE),
      select: { id: true },
    });
    const owner = randomUUID();
    const expires = new Date(now.getTime() + CLAIM_MS);
    const claimed: string[] = [];
    for (const candidate of candidates) {
      const result = await this.prisma.telegramPostBatchDelivery.updateMany({
        where: {
          id: candidate.id,
          deleteAt: { lte: now },
          OR: [
            { status: 'PUBLISHED' },
            { status: 'DELETE_FAILED', nextAttemptAt: { lte: now } },
            { status: 'DELETING', claimExpiresAt: { lte: now } },
          ],
        },
        data: {
          status: 'DELETING',
          claimOwner: owner,
          claimExpiresAt: expires,
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          lastError: null,
        },
      });
      if (result.count) claimed.push(candidate.id);
    }
    return this.claimedRows(claimed, owner);
  }

  private async remove(deliveries: ClaimedPostBatchDelivery[], now: Date) {
    const byWorkspace = groupPostBatchRows(
      deliveries,
      (item) => item.workspaceId,
    );
    for (const [workspaceId, rows] of byWorkspace) {
      await this.claimLease.runWithClaims(
        rows,
        TelegramPostBatchDeliveryStatus.DELETING,
        async (heldClaims) => {
          const heldIds = new Set(heldClaims.map((row) => row.id));
          const held = rows.filter((row) => heldIds.has(row.id));
          const result = await this.deletion.deletePublishedManagedPosts({
            workspaceId,
            managedPostIds: held.map((row) => row.managedPostId),
          });
          const byPost = new Map(
            result.results.map((item) => [item.postId, item]),
          );
          for (const row of held) {
            const outcome = byPost.get(row.managedPostId);
            if (outcome?.success) await this.markDeleted(row, now, 'DELETING');
            else
              await this.markFailure(
                row,
                outcome?.error ?? 'Deletion failed',
                'DELETE_FAILED',
              );
          }
        },
      );
    }
  }

  private claimedRows(
    ids: string[],
    owner: string,
  ): Promise<ClaimedPostBatchDelivery[]> {
    return this.prisma.telegramPostBatchDelivery.findMany({
      where: { id: { in: ids }, claimOwner: owner },
      select: {
        id: true,
        batchId: true,
        workspaceId: true,
        telegramChannelId: true,
        managedPostId: true,
        scheduledAt: true,
        deleteAfterHours: true,
        longTextMode: true,
        attemptCount: true,
        claimOwner: true,
        managedPost: {
          select: {
            status: true,
            publishedAt: true,
            telegramRemoteStatus: true,
            telegramMessageIds: true,
            text: true,
            buttonRows: true,
            sourceType: true,
            lastError: true,
          },
        },
      },
      orderBy: [
        { scheduledAt: 'asc' },
        { batchPost: { position: 'asc' } },
        { id: 'asc' },
      ],
    }) as Promise<ClaimedPostBatchDelivery[]>;
  }

  private markPublished(
    delivery: ClaimedPostBatchDelivery,
    publishedAt: Date,
    hours: number | null,
  ) {
    const data: Prisma.TelegramPostBatchDeliveryUpdateManyMutationInput = {
      status: 'PUBLISHED',
      publishedAt,
      deleteAt:
        hours === null
          ? null
          : new Date(publishedAt.getTime() + hours * 3_600_000),
      nextAttemptAt: null,
      attemptCount: 0,
      claimOwner: null,
      claimExpiresAt: null,
      lastError: null,
    };
    return hours === null
      ? this.transitionTerminal(delivery, 'PUBLISHING', data)
      : this.prisma.telegramPostBatchDelivery.updateMany({
          where: {
            id: delivery.id,
            status: 'PUBLISHING',
            claimOwner: delivery.claimOwner,
          },
          data,
        });
  }

  private markDeleted(
    delivery: ClaimedPostBatchDelivery,
    deletedAt: Date,
    expectedStatus: 'PUBLISHING' | 'DELETING',
  ) {
    return this.transitionTerminal(delivery, expectedStatus, {
      status: 'DELETED',
      deletedAt,
      nextAttemptAt: null,
      claimOwner: null,
      claimExpiresAt: null,
      lastError: null,
    });
  }

  private markFailure(
    delivery: ClaimedPostBatchDelivery,
    error: unknown,
    status: 'FAILED' | 'DELETE_FAILED',
  ) {
    const terminal =
      delivery.attemptCount >= MAX_ATTEMPTS ||
      error instanceof AmbiguousPostBatchPublicationError;
    const delay = Math.min(60, 2 ** Math.max(0, delivery.attemptCount - 1));
    const data: Prisma.TelegramPostBatchDeliveryUpdateManyMutationInput = {
      status,
      nextAttemptAt: terminal ? null : new Date(Date.now() + delay * 60_000),
      claimOwner: null,
      claimExpiresAt: null,
      lastError: failureMessage(error),
    };
    const expectedStatus =
      status === 'FAILED' ? ('PUBLISHING' as const) : ('DELETING' as const);
    return terminal
      ? this.transitionTerminal(
          delivery,
          expectedStatus,
          data,
          status === 'FAILED' ? failureMessage(error) : undefined,
        )
      : this.prisma.telegramPostBatchDelivery.updateMany({
          where: {
            id: delivery.id,
            status: expectedStatus,
            claimOwner: delivery.claimOwner,
          },
          data,
        });
  }

  private transitionTerminal(
    delivery: ClaimedPostBatchDelivery,
    expectedStatus: 'PUBLISHING' | 'DELETING',
    data: Prisma.TelegramPostBatchDeliveryUpdateManyMutationInput,
    managedPostError?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.telegramPostBatchDelivery.updateMany({
        where: {
          id: delivery.id,
          status: expectedStatus,
          claimOwner: delivery.claimOwner,
        },
        data,
      });
      if (updated.count) {
        if (managedPostError) {
          await tx.telegramManagedPost.updateMany({
            where: {
              id: delivery.managedPostId,
              workspaceId: delivery.workspaceId,
              scheduleMode: 'BATCH',
              status: { in: ['SCHEDULED', 'PUBLISHING', 'FAILED'] },
            },
            data: { status: 'FAILED', lastError: managedPostError },
          });
        }
      }
      return updated;
    });
  }
}

function failureMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    1_000,
  );
}
