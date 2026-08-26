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
  if (botApiLimitReached) return mtproto;
  return original ?? mtproto;
}
