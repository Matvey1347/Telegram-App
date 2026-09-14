import {
  preflightTelegramDeletionCapability,
  TELEGRAM_BOT_DELETE_LIMIT_HOURS,
} from '../../../../telegram/shared/telegram-deletion-policy';

export { TELEGRAM_BOT_DELETE_LIMIT_HOURS };

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
  if (input.isPermanent) return { ok: true };
  return preflightTelegramDeletionCapability(input);
}
