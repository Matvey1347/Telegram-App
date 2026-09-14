import {
  isTelegramMessageAlreadyAbsent,
  selectTelegramDeletionSource,
} from '../../../../telegram/shared/telegram-deletion-policy';

type DeletionSource = {
  sourceType: string;
  sourceId: string;
  permissions: { canDeleteMessages: boolean };
};

export function resolveAdPlacementDeletionMessageIds(input: {
  managedPost?: {
    telegramMessageIds: string[];
    telegramIdVerificationStatus: string;
  } | null;
  telegramPost?: { telegramMessageId: string } | null;
}) {
  const managedMessageIds = input.managedPost?.telegramMessageIds ?? [];
  if (managedMessageIds.length) {
    return input.managedPost?.telegramIdVerificationStatus === 'VERIFIED'
      ? managedMessageIds
      : [];
  }
  return input.telegramPost?.telegramMessageId
    ? [input.telegramPost.telegramMessageId]
    : [];
}

export function selectAdPlacementDeletionSource(
  sources: DeletionSource[],
  managedPost: {
    sourceType: string | null;
    sourceId: string | null;
    publishedAt: Date | null;
  },
  now = new Date(),
) {
  return selectTelegramDeletionSource(sources, managedPost, now, {
    // A delete call that reports an already-absent message is still a valid
    // terminal acknowledgement for legacy Ad Sale placements.
    allowExpiredOriginalProbe: true,
  });
}

export { isTelegramMessageAlreadyAbsent };
