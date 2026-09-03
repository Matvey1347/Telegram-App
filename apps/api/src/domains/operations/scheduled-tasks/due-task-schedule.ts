import { PrismaService } from '../../../prisma/prisma.service';
import {
  AD_DELETION_RETRY_MS,
  MANAGED_POST_IDENTITY_RETRY_MS,
  MANAGED_POST_LOCAL_PUBLISHING_STALE_MS,
  adDeletionReadyWhere,
  adPlacementLifecycleReadyWhere,
  greeterBroadcastDispatchableWhere,
  greeterExpiryClaimableWhere,
  managedPostIdentityCandidateWhere,
  managedPostIdentityReadyWhere,
} from './due-work-predicates';
import { Prisma } from '@prisma/client';

const NO_PROGRESS_MIN_BACKOFF_MS = 5_000;
const NO_PROGRESS_MAX_BACKOFF_MS = 15 * 60_000;

export class DueTaskSchedule {
  private readonly progress = new Map<
    string,
    { rawDueAt: number; unchangedRuns: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async refresh(taskKey: string, attempted = false) {
    const rawDueAt = await this.nextDueAt(taskKey);
    const dueAt = this.guardNoProgress(taskKey, rawDueAt, attempted);
    const configs = await this.prisma.scheduledTaskConfig.findMany({
      where: { taskKey, workspaceId: null, enabled: true },
      select: {
        id: true,
        updatedAt: true,
        nextScheduledRunAt: true,
        scheduledClaimOwner: true,
        scheduledClaimExpiresAt: true,
      },
    });
    await Promise.all(
      configs.map(async (config) => {
        const now = new Date();
        const liveClaim =
          config.scheduledClaimOwner !== null &&
          config.scheduledClaimExpiresAt !== null &&
          config.scheduledClaimExpiresAt > now;
        if (liveClaim) return;
        const unchanged =
          config.nextScheduledRunAt?.getTime() === dueAt?.getTime() &&
          config.scheduledClaimOwner === null &&
          config.scheduledClaimExpiresAt === null;
        if (unchanged) return;
        await this.prisma.scheduledTaskConfig.updateMany({
          where: {
            id: config.id,
            updatedAt: config.updatedAt,
            enabled: true,
            OR: [
              { scheduledClaimExpiresAt: null },
              { scheduledClaimExpiresAt: { lte: now } },
            ],
          },
          data: {
            nextScheduledRunAt: dueAt,
            scheduledClaimOwner: null,
            scheduledClaimExpiresAt: null,
          },
        });
      }),
    );
  }

  guardNoProgress(taskKey: string, rawDueAt: Date | null, attempted: boolean) {
    if (!rawDueAt || rawDueAt.getTime() > Date.now()) {
      this.progress.delete(taskKey);
      return rawDueAt;
    }
    const rawTimestamp = rawDueAt.getTime();
    const state = this.progress.get(taskKey);
    if (!state || state.rawDueAt !== rawTimestamp) {
      this.progress.set(taskKey, { rawDueAt: rawTimestamp, unchangedRuns: 0 });
      return attempted
        ? this.noProgressBackoff(taskKey, rawTimestamp)
        : rawDueAt;
    }
    if (!attempted) return rawDueAt;
    return this.noProgressBackoff(taskKey, rawTimestamp);
  }

  private noProgressBackoff(taskKey: string, rawDueAt: number) {
    const state = this.progress.get(taskKey) ?? {
      rawDueAt,
      unchangedRuns: 0,
    };
    this.progress.set(taskKey, state);
    state.unchangedRuns += 1;
    const delay = Math.min(
      NO_PROGRESS_MAX_BACKOFF_MS,
      NO_PROGRESS_MIN_BACKOFF_MS * 2 ** (state.unchangedRuns - 1),
    );
    return new Date(Date.now() + delay);
  }

  async nextDueAt(taskKey: string): Promise<Date | null> {
    const now = new Date();
    switch (taskKey) {
      case 'telegram.managed_posts.reconcile_due':
        return this.nextManagedPostDueAt(now);
      case 'telegram_ad_sales.due_deletions':
        return this.nextAdDeletionDueAt(now);
      case 'operations.notifications.publish_due':
        return this.nextOperationsNotificationDueAt();
      case 'greeter.expire_pending':
        return this.nextGreeterExpiryDueAt(now);
      case 'greeter.broadcasts.dispatch':
        return this.nextGreeterBroadcastDueAt(now);
      case 'greeter.automations.repair': {
        const row = await this.prisma.greeterSequenceStepExecution.findFirst({
          where: { status: 'PENDING' },
          orderBy: { dueAt: 'asc' },
          select: { dueAt: true },
        });
        return row?.dueAt ?? null;
      }
      default:
        return null;
    }
  }

  private async nextManagedPostDueAt(now: Date) {
    const retryCutoff = new Date(
      now.getTime() - MANAGED_POST_IDENTITY_RETRY_MS,
    );
    const [local, ready, futureIdentity, backedOff] = await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: {
          scheduleMode: 'LOCAL',
          OR: [
            { status: 'SCHEDULED', scheduledAt: { not: null } },
            { status: 'PUBLISHING' },
          ],
        },
        orderBy: [{ scheduledAt: 'asc' }, { updatedAt: 'asc' }],
        select: { status: true, scheduledAt: true, updatedAt: true },
      }),
      this.prisma.telegramManagedPost.findFirst({
        where: managedPostIdentityReadyWhere(now),
        orderBy: [{ telegramIdLastCheckedAt: 'asc' }, { id: 'asc' }],
        select: {
          scheduledAt: true,
          telegramIdLastCheckedAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.telegramManagedPost.findFirst({
        where: {
          status: 'SCHEDULED',
          telegramIdVerificationStatus: 'UNVERIFIED',
          scheduledAt: { gt: now },
        },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      }),
      this.prisma.telegramManagedPost.findFirst({
        where: {
          ...managedPostIdentityCandidateWhere(now),
          telegramIdLastCheckedAt: { gt: retryCutoff },
        },
        orderBy: { telegramIdLastCheckedAt: 'asc' },
        select: { scheduledAt: true, telegramIdLastCheckedAt: true },
      }),
    ]);
    const readyAt = ready
      ? ready.telegramIdLastCheckedAt
        ? new Date(
            ready.telegramIdLastCheckedAt.getTime() +
              MANAGED_POST_IDENTITY_RETRY_MS,
          )
        : (ready.scheduledAt ?? ready.updatedAt)
      : null;
    const backedOffAt = backedOff?.telegramIdLastCheckedAt
      ? new Date(
          Math.max(
            backedOff.scheduledAt?.getTime() ?? 0,
            backedOff.telegramIdLastCheckedAt.getTime() +
              MANAGED_POST_IDENTITY_RETRY_MS,
          ),
        )
      : null;
    return earliest([
      local?.status === 'PUBLISHING'
        ? new Date(
            local.updatedAt.getTime() + MANAGED_POST_LOCAL_PUBLISHING_STALE_MS,
          )
        : local?.scheduledAt,
      readyAt,
      futureIdentity?.scheduledAt,
      backedOffAt,
    ]);
  }

  private async nextOperationsNotificationDueAt() {
    const rows = await this.prisma.$queryRaw<Array<{ dueAt: Date }>>(Prisma.sql`
      SELECT MIN(candidate."dueAt") AS "dueAt"
      FROM (
        (SELECT "deliverAt" AS "dueAt"
         FROM "OperationsNotification"
         WHERE "publishedAt" IS NULL
         ORDER BY "deliverAt", "id"
         LIMIT 1)
        UNION ALL
        (SELECT "expiresAt" AS "dueAt"
         FROM "OperationsNotification"
         WHERE "publishedAt" IS NOT NULL
         ORDER BY "expiresAt", "id"
         LIMIT 1)
      ) candidate
    `);
    return rows[0]?.dueAt ?? null;
  }

  private async nextAdDeletionDueAt(now: Date) {
    const retryCutoff = new Date(now.getTime() - AD_DELETION_RETRY_MS);
    const [lifecycle, ready, future, backedOff] = await Promise.all([
      this.prisma.telegramAdSalePlacement.findFirst({
        where: adPlacementLifecycleReadyWhere(),
        orderBy: { updatedAt: 'asc' },
        select: {
          updatedAt: true,
          managedPost: { select: { publishedAt: true } },
        },
      }),
      this.prisma.telegramAdSalePlacement.findFirst({
        where: adDeletionReadyWhere(now),
        orderBy: { plannedDeleteAt: 'asc' },
        select: { plannedDeleteAt: true },
      }),
      this.prisma.telegramAdSalePlacement.findFirst({
        where: {
          status: 'PUBLISHED',
          plannedDeleteAt: { gt: now },
          deletedAt: null,
          isPermanentSnapshot: false,
        },
        orderBy: { plannedDeleteAt: 'asc' },
        select: { plannedDeleteAt: true },
      }),
      this.prisma.telegramAdSalePlacement.findFirst({
        where: {
          status: 'PUBLISHED',
          plannedDeleteAt: { lte: now },
          deletedAt: null,
          isPermanentSnapshot: false,
          lastDeletionAttemptAt: { gt: retryCutoff },
        },
        orderBy: { lastDeletionAttemptAt: 'asc' },
        select: { plannedDeleteAt: true, lastDeletionAttemptAt: true },
      }),
    ]);
    const backedOffAt = backedOff?.lastDeletionAttemptAt
      ? new Date(
          Math.max(
            backedOff.plannedDeleteAt?.getTime() ?? 0,
            backedOff.lastDeletionAttemptAt.getTime() + AD_DELETION_RETRY_MS,
          ),
        )
      : null;
    return earliest([
      lifecycle?.managedPost?.publishedAt ?? lifecycle?.updatedAt,
      ready?.plannedDeleteAt,
      future?.plannedDeleteAt,
      backedOffAt,
    ]);
  }

  private async nextGreeterExpiryDueAt(now: Date) {
    const [ready, future, claimed] = await Promise.all([
      this.prisma.greeterJoinRequest.findFirst({
        where: greeterExpiryClaimableWhere(now),
        orderBy: { expiredAt: 'asc' },
        select: { expiredAt: true },
      }),
      this.prisma.greeterJoinRequest.findFirst({
        where: { status: 'PENDING_CAPTCHA', expiredAt: { gt: now } },
        orderBy: { expiredAt: 'asc' },
        select: { expiredAt: true },
      }),
      this.prisma.greeterJoinRequest.findFirst({
        where: {
          status: 'PENDING_CAPTCHA',
          expiredAt: { lte: now },
          expiryClaimUntil: { gt: now },
        },
        orderBy: { expiryClaimUntil: 'asc' },
        select: { expiredAt: true, expiryClaimUntil: true },
      }),
    ]);
    const claimedAt = claimed?.expiryClaimUntil
      ? new Date(
          Math.max(
            claimed.expiredAt?.getTime() ?? 0,
            claimed.expiryClaimUntil.getTime(),
          ),
        )
      : null;
    return earliest([ready?.expiredAt, future?.expiredAt, claimedAt]);
  }

  private async nextGreeterBroadcastDueAt(now: Date) {
    const [ready, future, retry] = await Promise.all([
      this.prisma.greeterBroadcast.findFirst({
        where: greeterBroadcastDispatchableWhere(now),
        orderBy: { updatedAt: 'asc' },
        select: {
          status: true,
          scheduledAt: true,
          processingStartedAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.greeterBroadcast.findFirst({
        where: { status: 'SCHEDULED', scheduledAt: { gt: now } },
        orderBy: { scheduledAt: 'asc' },
        select: { scheduledAt: true },
      }),
      this.prisma.greeterBroadcastRecipient.findFirst({
        where: {
          status: 'PENDING',
          lastError: { not: null },
          nextQueueAttemptAt: { gt: now },
          broadcast: { status: 'PROCESSING' },
        },
        orderBy: { nextQueueAttemptAt: 'asc' },
        select: { nextQueueAttemptAt: true },
      }),
    ]);
    const readyAt = ready
      ? ready.status === 'SCHEDULED'
        ? ready.scheduledAt
        : (ready.processingStartedAt ?? ready.updatedAt)
      : null;
    const retryAt = retry?.nextQueueAttemptAt ?? null;
    return earliest([readyAt, future?.scheduledAt, retryAt]);
  }
}

function earliest(values: Array<Date | null | undefined>) {
  const candidates = values.filter((value): value is Date => Boolean(value));
  return candidates.length
    ? new Date(Math.min(...candidates.map((value) => value.getTime())))
    : null;
}
