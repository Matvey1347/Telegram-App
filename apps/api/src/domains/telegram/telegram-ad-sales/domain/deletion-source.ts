const BOT_API_DELETE_LIMIT_MS = 48 * 60 * 60 * 1000;

type DeletionSource = {
  sourceType: string;
  sourceId: string;
  permissions: { canDeleteMessages: boolean };
};

export function selectAdPlacementDeletionSource(
  sources: DeletionSource[],
  managedPost: {
    sourceType: string | null;
    sourceId: string | null;
    publishedAt: Date | null;
  },
  now = new Date(),
) {
  const available = sources.filter(
    (source) => source.permissions.canDeleteMessages,
  );
  const original = available.find(
    (source) =>
      source.sourceType === managedPost.sourceType &&
      source.sourceId === managedPost.sourceId,
  );
  const mtproto = available.find((source) => source.sourceType === 'MTPROTO');
  const botApiLimitReached =
    (original?.sourceType === 'BOT' || original?.sourceType === 'BOT_API') &&
    managedPost.publishedAt !== null &&
    now.getTime() - managedPost.publishedAt.getTime() >=
      BOT_API_DELETE_LIMIT_MS;
  // Prefer MTProto after Bot API's deletion window. If it is unavailable,
  // still call the original bot: Telegram can then confirm that a post which
  // was removed manually is already absent, making cleanup idempotent.
  if (botApiLimitReached) return mtproto ?? original;
  return original ?? mtproto;
}

export function isTelegramMessageAlreadyAbsent(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const normalized = message.toLowerCase();
  return (
    normalized.includes('message to delete not found') ||
    normalized.includes("message doesn't exist") ||
    normalized.includes('message does not exist') ||
    normalized.includes('message_id_invalid')
  );
}
