import {
  TELEGRAM_MANAGED_POST_STATUS_KEYS,
  TELEGRAM_POSTS_ERROR_KEYS,
} from "@telegram-system/shared";
import type { BulkActionResultItem, TelegramManagedPost } from "@/lib/api";
import type { AppLocale, TranslationValues } from "@/i18n/types";
import type { TranslationKey } from "@/i18n/catalog";

export { TELEGRAM_MANAGED_POST_STATUS_KEYS } from "@telegram-system/shared";

export const TELEGRAM_REMOTE_STATUS_KEYS = {
  UNKNOWN: "telegram.posts.remoteStatus.unknown",
  PUBLISHED: "telegramPosts.status.published",
  SCHEDULED: "telegramPosts.status.scheduled",
  MISSING: "telegram.posts.remoteStatus.missing",
  BROKEN: "telegram.posts.remoteStatus.broken",
} as const;

export function telegramManagedPostStatusKey(
  status: TelegramManagedPost["status"],
) {
  return TELEGRAM_MANAGED_POST_STATUS_KEYS[status];
}

export function telegramRemoteStatusKey(status: string) {
  return (
    TELEGRAM_REMOTE_STATUS_KEYS[
      status as keyof typeof TELEGRAM_REMOTE_STATUS_KEYS
    ] ?? TELEGRAM_REMOTE_STATUS_KEYS.UNKNOWN
  );
}

const BULK_ACTION_KEYS = {
  PUBLISHED: "telegram.posts.bulk.published",
  SCHEDULED: "telegram.posts.bulk.scheduled",
  MOVED: "telegram.posts.bulk.moved",
  CONVERTED_TO_DRAFT: "telegram.posts.bulk.convertedToDraft",
  DELETED: "telegram.posts.bulk.deleted",
  SKIPPED: "telegram.posts.bulk.skipped",
  FAILED: "telegram.posts.bulk.failed",
} as const satisfies Record<BulkActionResultItem["action"], TranslationKey>;

export function localizedBulkActionMessage(
  item: BulkActionResultItem,
  locale: AppLocale,
  translate: (key: TranslationKey, values?: TranslationValues) => string,
) {
  if (item.errorCode && item.errorCode in TELEGRAM_POSTS_ERROR_KEYS) {
    return translate(
      TELEGRAM_POSTS_ERROR_KEYS[
        item.errorCode as keyof typeof TELEGRAM_POSTS_ERROR_KEYS
      ] as TranslationKey,
      item.errorParams,
    );
  }
  if (!item.success && locale === "en" && item.error?.trim()) return item.error;
  return translate(BULK_ACTION_KEYS[item.action]);
}
