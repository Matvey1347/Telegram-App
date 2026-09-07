import {
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';

const AUTO_DELETED_NOTE =
  'Advertising placement was published and then automatically deleted after format expiry.';

type AdvertisingManagedPost = {
  publishedAt: Date | null;
  group?: { isSystem: boolean; systemKey: string | null } | null;
};

type CompletedPlacement = {
  publishedAt: Date | null;
  managedPost: AdvertisingManagedPost | null;
};

export function isSystemAdvertisingManagedPost(
  post: AdvertisingManagedPost | null,
) {
  return post?.group?.isSystem === true && post.group.systemKey === 'ADVERTISE';
}

/** Persist the terminal state proven by a successfully completed ad placement. */
export function completedAdvertisingPostUpdate(
  placement: CompletedPlacement,
  completedAt: Date,
) {
  if (!isSystemAdvertisingManagedPost(placement.managedPost)) {
    return {
      telegramRemoteStatus: TelegramManagedPostRemoteStatus.MISSING,
      lastTelegramSyncedAt: completedAt,
      lastTelegramSyncNote: 'Placement deleted after ad format expiry.',
    };
  }
  return {
    status: TelegramManagedPostStatus.PUBLISHED,
    telegramRemoteStatus: TelegramManagedPostRemoteStatus.AUTO_DELETED,
    scheduledAt: null,
    publishedAt: placement.managedPost?.publishedAt ?? placement.publishedAt,
    lastError: null,
    lastTelegramSyncedAt: completedAt,
    lastTelegramSyncNote: AUTO_DELETED_NOTE,
  };
}

export function missingPublishedPostUpdate(
  post: AdvertisingManagedPost & {
    completedAdPlacements?: Array<{ publishedAt: Date | null }>;
  },
  checkedAt: Date,
) {
  const completedPlacement = post.completedAdPlacements?.[0];
  if (completedPlacement && isSystemAdvertisingManagedPost(post)) {
    return completedAdvertisingPostUpdate(
      { publishedAt: completedPlacement.publishedAt, managedPost: post },
      checkedAt,
    );
  }
  return {
    status: TelegramManagedPostStatus.PUBLISHED,
    telegramRemoteStatus: TelegramManagedPostRemoteStatus.BROKEN,
    lastError: 'Telegram post link is broken.',
    lastTelegramSyncedAt: checkedAt,
    lastTelegramSyncNote:
      'Published Telegram post was not found during sync. Post was kept published and marked as broken.',
  };
}
