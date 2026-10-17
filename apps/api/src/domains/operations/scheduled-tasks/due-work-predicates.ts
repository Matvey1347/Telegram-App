import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';

export const MANAGED_POST_IDENTITY_RETRY_MS = 45_000;
// A published post whose Telegram identity is already confirmed only needs a
// secondary local-link repair. Keep the fast identity retry for publication
// confirmation, but do not repeatedly wake the worker/Telegram for this
// independent recovery path.
export const MANAGED_POST_DEPENDENT_REPAIR_RETRY_MS = 5 * 60_000;
export const MANAGED_POST_MISSING_IDENTITY_RETRY_MS = 30 * 60_000;
export const MANAGED_POST_LOCAL_PUBLISHING_STALE_MS = 10 * 60_000;
export const AD_DELETION_RETRY_MS = 5 * 60_000;

export const MANAGED_POST_DEPENDENT_REPAIR_PENDING_NOTE =
  'Published Telegram identity verified; dependent scheduled-link repair pending.';

export function managedPostIdentityCandidateWhere(
  now: Date,
): Prisma.TelegramManagedPostWhereInput {
  return {
    OR: [
      managedPostUnverifiedIdentityCandidateWhere(now),
      managedPostDependentRepairCandidateWhere(),
      {
        telegramIdVerificationStatus:
          TelegramManagedPostIdVerificationStatus.MISSING,
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduledAt: { lte: now },
        AND: [
          {
            OR: [{ scheduleMode: null }, { scheduleMode: { not: 'BATCH' } }],
          },
        ],
      },
    ],
  };
}

function managedPostUnverifiedIdentityCandidateWhere(
  now: Date,
): Prisma.TelegramManagedPostWhereInput {
  return {
    telegramIdVerificationStatus:
      TelegramManagedPostIdVerificationStatus.UNVERIFIED,
    status: TelegramManagedPostStatus.SCHEDULED,
    scheduledAt: { lte: now },
    AND: [
      {
        OR: [{ scheduleMode: null }, { scheduleMode: { not: 'BATCH' } }],
      },
    ],
  };
}

function managedPostDependentRepairCandidateWhere(): Prisma.TelegramManagedPostWhereInput {
  return {
    telegramIdVerificationStatus:
      TelegramManagedPostIdVerificationStatus.UNVERIFIED,
    status: TelegramManagedPostStatus.PUBLISHED,
    lastTelegramSyncNote: MANAGED_POST_DEPENDENT_REPAIR_PENDING_NOTE,
  };
}

export function managedPostIdentityReadyWhere(
  now: Date,
): Prisma.TelegramManagedPostWhereInput {
  return {
    OR: [
      {
        ...managedPostUnverifiedIdentityCandidateWhere(now),
        OR: [
          { telegramIdLastCheckedAt: null },
          {
            telegramIdLastCheckedAt: {
              lte: new Date(now.getTime() - MANAGED_POST_IDENTITY_RETRY_MS),
            },
          },
        ],
      },
      {
        ...managedPostDependentRepairCandidateWhere(),
        OR: [
          { telegramIdLastCheckedAt: null },
          {
            telegramIdLastCheckedAt: {
              lte: new Date(
                now.getTime() - MANAGED_POST_DEPENDENT_REPAIR_RETRY_MS,
              ),
            },
          },
        ],
      },
      {
        telegramIdVerificationStatus:
          TelegramManagedPostIdVerificationStatus.MISSING,
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduledAt: { lte: now },
        AND: [
          {
            OR: [{ scheduleMode: null }, { scheduleMode: { not: 'BATCH' } }],
          },
        ],
        OR: [
          { telegramIdLastCheckedAt: null },
          {
            telegramIdLastCheckedAt: {
              lte: new Date(
                now.getTime() - MANAGED_POST_MISSING_IDENTITY_RETRY_MS,
              ),
            },
          },
        ],
      },
    ],
  };
}

export function adDeletionReadyWhere(
  now: Date,
): Prisma.TelegramAdSalePlacementWhereInput {
  return {
    status: TelegramAdPlacementStatus.PUBLISHED,
    plannedDeleteAt: { lte: now },
    deletedAt: null,
    isPermanentSnapshot: false,
    OR: [
      { lastDeletionAttemptAt: null },
      {
        lastDeletionAttemptAt: {
          lte: new Date(now.getTime() - AD_DELETION_RETRY_MS),
        },
      },
    ],
  };
}

export function adPlacementLifecycleReadyWhere(): Prisma.TelegramAdSalePlacementWhereInput {
  return {
    OR: [
      {
        managedPostId: { not: null },
        OR: [
          { status: TelegramAdPlacementStatus.SCHEDULED },
          {
            status: TelegramAdPlacementStatus.PUBLISHED,
            plannedDeleteAt: null,
            isPermanentSnapshot: false,
          },
        ],
        managedPost: {
          status: TelegramManagedPostStatus.PUBLISHED,
          telegramIdVerificationStatus:
            TelegramManagedPostIdVerificationStatus.VERIFIED,
          publishedAt: { not: null },
        },
      },
      { telegramPostId: { not: null }, publishedAt: null },
    ],
  };
}
