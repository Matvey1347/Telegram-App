import { preflightTelegramDeletionCapability } from '../../../telegram/shared/telegram-deletion-policy';

type PostBatchSource = {
  sourceType: string;
  permissions: {
    canPostMessages: boolean;
    canDeleteMessages: boolean;
  };
};

export function postBatchSourceCapabilityFailure(input: {
  deleteAfterHours: number | null;
  requiresPublishing: boolean;
  requiresBotApi: boolean;
  sources: PostBatchSource[];
}) {
  if (
    input.requiresPublishing &&
    !input.sources.some((source) => source.permissions.canPostMessages)
  ) {
    return 'A selected channel has no publishing source';
  }
  if (
    input.requiresBotApi &&
    !input.sources.some(
      (source) =>
        source.sourceType === 'BOT' && source.permissions.canPostMessages,
    )
  ) {
    return 'Inline buttons and native Telegram rich content require an active workspace bot with posting permission for every selected channel.';
  }
  if (
    input.deleteAfterHours !== null &&
    !input.sources.some((source) => source.permissions.canDeleteMessages)
  ) {
    return 'A selected channel has no source with permission to delete this finite-lifetime post.';
  }
  const deletion = preflightTelegramDeletionCapability({
    deleteAfterHours: input.deleteAfterHours,
    sources: input.sources,
  });
  return deletion.ok ? null : deletion.message;
}
