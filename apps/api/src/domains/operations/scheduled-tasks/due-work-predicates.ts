import {
  GreeterBroadcastRecipientStatus,
  GreeterBroadcastStatus,
  GreeterJoinRequestStatus,
  Prisma,
  TelegramAdPlacementStatus,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';

export const MANAGED_POST_IDENTITY_RETRY_MS = 45_000;
export const GREETER_BROADCAST_RETRY_MS = 5 * 60_000;
export const GREETER_EXPIRY_RETRY_MS = 5 * 60_000;
export const GREETER_AUTOMATION_RETRY_MS = 5 * 60_000;
export const AD_DELETION_RETRY_MS = 5 * 60_000;

export const MANAGED_POST_DEPENDENT_REPAIR_PENDING_NOTE =
  'Published Telegram identity verified; dependent scheduled-link repair pending.';

export function managedPostIdentityCandidateWhere(
  now: Date,
): Prisma.TelegramManagedPostWhereInput {
  return {
    telegramIdVerificationStatus:
      TelegramManagedPostIdVerificationStatus.UNVERIFIED,
    OR: [
      {
        status: TelegramManagedPostStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      {
        status: TelegramManagedPostStatus.PUBLISHED,
        lastTelegramSyncNote: MANAGED_POST_DEPENDENT_REPAIR_PENDING_NOTE,
      },
    ],
  };
}

export function managedPostIdentityReadyWhere(
  now: Date,
): Prisma.TelegramManagedPostWhereInput {
  return {
    ...managedPostIdentityCandidateWhere(now),
    AND: [
      {
        OR: [
          { telegramIdLastCheckedAt: null },
          {
            telegramIdLastCheckedAt: {
              lte: new Date(now.getTime() - MANAGED_POST_IDENTITY_RETRY_MS),
            },
          },
        ],
      },
    ],
  };
}

export function greeterBroadcastDispatchableWhere(
  now: Date,
): Prisma.GreeterBroadcastWhereInput {
  return {
    OR: [
      {
        status: GreeterBroadcastStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      {
        status: GreeterBroadcastStatus.PROCESSING,
        OR: [
          { recipients: { none: {} } },
          {
            recipients: {
              some: {
                status: GreeterBroadcastRecipientStatus.PENDING,
                OR: [
                  { nextQueueAttemptAt: null },
                  { nextQueueAttemptAt: { lte: now } },
                ],
              },
            },
          },
          {
            AND: [
              { recipients: { some: {} } },
              {
                recipients: {
                  none: {
                    status: {
                      in: [
                        GreeterBroadcastRecipientStatus.PENDING,
                        GreeterBroadcastRecipientStatus.QUEUED,
                      ],
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

export function greeterExpiryClaimableWhere(
  now: Date,
): Prisma.GreeterJoinRequestWhereInput {
  return {
    status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
    expiredAt: { lte: now },
    OR: [{ expiryClaimUntil: null }, { expiryClaimUntil: { lte: now } }],
  };
}

export function greeterAutomationDueWhere(
  now: Date,
): Prisma.GreeterSequenceStepExecutionWhereInput {
  return { status: 'PENDING', dueAt: { lte: now } };
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
  };
}
