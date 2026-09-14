export const TELEGRAM_BOT_DELETE_LIMIT_HOURS = 48;
const TELEGRAM_BOT_DELETE_LIMIT_MS =
  TELEGRAM_BOT_DELETE_LIMIT_HOURS * 60 * 60 * 1_000;

export type TelegramDeletionSource = {
  sourceType: string;
  sourceId: string;
  permissions: { canDeleteMessages: boolean };
};

export function selectTelegramDeletionSource<T extends TelegramDeletionSource>(
  sources: T[],
  published: {
    sourceType: string | null;
    sourceId: string | null;
    publishedAt: Date | null;
  },
  now = new Date(),
  options: { allowExpiredOriginalProbe?: boolean } = {},
) {
  const available = sources.filter(
    (source) => source.permissions.canDeleteMessages,
  );
  const original = available.find(
    (source) =>
      source.sourceType === published.sourceType &&
      source.sourceId === published.sourceId,
  );
  const mtproto = available.find((source) => source.sourceType === 'MTPROTO');
  const botWindowExpired =
    (published.sourceType === 'BOT' || published.sourceType === 'BOT_API') &&
    published.publishedAt instanceof Date &&
    now.getTime() - published.publishedAt.getTime() >=
      TELEGRAM_BOT_DELETE_LIMIT_MS;
  return botWindowExpired
    ? (mtproto ?? (options.allowExpiredOriginalProbe ? original : undefined))
    : (original ?? mtproto ?? available[0]);
}

export function preflightTelegramDeletionCapability(input: {
  publishingSourceType?: string | null;
  deleteAfterHours: number | null;
  sources: Array<{
    sourceType: string;
    permissions: { canDeleteMessages: boolean };
  }>;
}) {
  if (
    input.deleteAfterHours === null ||
    input.deleteAfterHours < TELEGRAM_BOT_DELETE_LIMIT_HOURS ||
    input.publishingSourceType === 'MTPROTO'
  ) {
    return { ok: true as const };
  }
  const hasMtproto = input.sources.some(
    (source) =>
      source.sourceType === 'MTPROTO' && source.permissions.canDeleteMessages,
  );
  return hasMtproto
    ? { ok: true as const }
    : {
        ok: false as const,
        code: 'MTPROTO_DELETE_SOURCE_REQUIRED' as const,
        message:
          'A connected MTProto admin with delete permission is required for deletion after 48 hours.',
      };
}

export function isTelegramMessageAlreadyAbsent(
  error: unknown,
  options: { singleMessage?: boolean } = {},
) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /message (?:to delete )?not found|message (?:doesn't|does not) exist|MESSAGE_DELETE_FORBIDDEN.*already|message.*already (?:deleted|absent)/i.test(
      message,
    ) ||
    (options.singleMessage === true &&
      /m(?:essage|sg)_id_invalid/i.test(message))
  );
}
