export const TELEGRAM_BOT_DELETE_LIMIT_HOURS = 48;

type TelegramDeletionSourceCapability = {
  sourceType: string;
  permissions: { canDeleteMessages: boolean };
};

export type TelegramAdDeletionPreflightResult =
  | { ok: true }
  | {
      ok: false;
      code: 'MTPROTO_DELETE_SOURCE_REQUIRED';
      message: string;
    };

export function preflightTelegramAdDeletionCapability(input: {
  publishingSourceType: string;
  deleteAfterHours: number | null;
  isPermanent: boolean;
  sources: TelegramDeletionSourceCapability[];
}): TelegramAdDeletionPreflightResult {
  if (
    input.isPermanent ||
    input.deleteAfterHours === null ||
    input.publishingSourceType === 'MTPROTO' ||
    input.deleteAfterHours < TELEGRAM_BOT_DELETE_LIMIT_HOURS
  ) {
    return { ok: true };
  }

  const publishesViaBot =
    input.publishingSourceType === 'BOT' ||
    input.publishingSourceType === 'BOT_API';
  const hasMtprotoDeleteSource = input.sources.some(
    (source) =>
      source.sourceType === 'MTPROTO' && source.permissions.canDeleteMessages,
  );
  if (!publishesViaBot || hasMtprotoDeleteSource) return { ok: true };

  return {
    ok: false,
    code: 'MTPROTO_DELETE_SOURCE_REQUIRED',
    message:
      'A connected MTProto admin with delete permission is required for deletion after 48 hours.',
  };
}
