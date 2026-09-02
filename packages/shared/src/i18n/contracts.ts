export const I18N_NAMESPACES = [
  "common",
  "navigation",
  "auth",
  "account",
  "ad-sales/common",
  "telegram/posts/common",
  "telegram/posts/editor",
  "telegram/posts/groups",
  "telegram/posts/calendar",
  "telegram/posts/import",
  "telegram/system-bot",
  "notifications",
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

export type TranslationParams = Readonly<
  Record<string, string | number | boolean | null>
>;

export const AUTH_ERROR_CODES = [
  "AUTH_EMAIL_ALREADY_EXISTS",
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_RESET_TOKEN_INVALID",
  "AUTH_TOO_MANY_ATTEMPTS",
  "AUTH_SESSION_INVALID",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const AUTH_ERROR_KEYS: Readonly<Record<AuthErrorCode, string>> = {
  AUTH_EMAIL_ALREADY_EXISTS: "auth.errors.emailAlreadyExists",
  AUTH_INVALID_CREDENTIALS: "auth.errors.invalidCredentials",
  AUTH_RESET_TOKEN_INVALID: "auth.errors.resetTokenInvalid",
  AUTH_TOO_MANY_ATTEMPTS: "auth.errors.tooManyAttempts",
  AUTH_SESSION_INVALID: "auth.errors.sessionInvalid",
};

export const ACCOUNT_ERROR_CODES = [
  "ACCOUNT_NAME_EMPTY",
  "ACCOUNT_EMAIL_ALREADY_EXISTS",
  "ACCOUNT_AVATAR_NOT_FOUND",
  "ACCOUNT_TELEGRAM_USERNAME_ASSIGNED",
  "ACCOUNT_TELEGRAM_ACCOUNTS_NOT_FOUND",
  "ACCOUNT_TELEGRAM_ACCOUNTS_ASSIGNED",
  "ACCOUNT_CURRENT_PASSWORD_INCORRECT",
] as const;

export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number];

export const ACCOUNT_ERROR_KEYS: Readonly<Record<AccountErrorCode, string>> = {
  ACCOUNT_NAME_EMPTY: "account.errors.nameEmpty",
  ACCOUNT_EMAIL_ALREADY_EXISTS: "account.errors.emailAlreadyExists",
  ACCOUNT_AVATAR_NOT_FOUND: "account.errors.avatarNotFound",
  ACCOUNT_TELEGRAM_USERNAME_ASSIGNED: "account.errors.telegramUsernameAssigned",
  ACCOUNT_TELEGRAM_ACCOUNTS_NOT_FOUND:
    "account.errors.telegramAccountsNotFound",
  ACCOUNT_TELEGRAM_ACCOUNTS_ASSIGNED: "account.errors.telegramAccountsAssigned",
  ACCOUNT_CURRENT_PASSWORD_INCORRECT: "account.errors.currentPasswordIncorrect",
};

export const TELEGRAM_AD_SALE_STATUS_KEYS = {
  DRAFT: "adSales.status.draft",
  RESERVED: "adSales.status.reserved",
  CONFIRMED: "adSales.status.confirmed",
  IN_PROGRESS: "adSales.status.inProgress",
  COMPLETED: "adSales.status.completed",
  CANCELLED: "adSales.status.cancelled",
} as const satisfies Record<TelegramAdSaleStatus, string>;

export const TELEGRAM_AD_PLACEMENT_STATUS_KEYS = {
  DRAFT: "adSales.placementStatus.draft",
  RESERVED: "adSales.placementStatus.reserved",
  SCHEDULED: "adSales.placementStatus.scheduled",
  PUBLISHED: "adSales.placementStatus.published",
  COMPLETED: "adSales.placementStatus.completed",
  CANCELLED: "adSales.placementStatus.cancelled",
  MISSED: "adSales.placementStatus.missed",
} as const satisfies Record<TelegramAdPlacementStatus, string>;

export const TELEGRAM_AD_SALE_PAYMENT_STATUS_KEYS = {
  UNPAID: "adSales.status.unpaid",
  PARTIALLY_PAID: "adSales.status.partiallyPaid",
  PAID: "adSales.status.paid",
  OVERPAID: "adSales.status.overpaid",
} as const satisfies Record<TelegramAdSaleComputedPaymentStatus, string>;

export const TELEGRAM_MANAGED_POST_STATUS_KEYS = {
  DRAFT: "telegramPosts.status.draft",
  SCHEDULED: "telegramPosts.status.scheduled",
  PUBLISHING: "telegramPosts.status.publishing",
  PUBLISHED: "telegramPosts.status.published",
  FAILED: "telegramPosts.status.failed",
} as const;

export const TELEGRAM_POST_GROUP_SYSTEM_TITLE_KEYS = {
  TELEGRAM_IMPORTED: "telegramPosts.systemGroup.createdInTelegram",
  ADVERTISE: "telegramPosts.systemGroup.advertise",
  SYSTEM_BOT_POSTS: "telegramPosts.systemGroup.systemBotPosts",
} as const;

export const TELEGRAM_POSTS_ERROR_CODES = [
  "TELEGRAM_CHANNEL_NOT_FOUND",
  "TELEGRAM_MANAGED_POST_NOT_FOUND",
  "TELEGRAM_POST_GROUP_NOT_FOUND",
  "TELEGRAM_POST_TITLE_REQUIRED",
  "TELEGRAM_POST_ASSIGNED_MEMBER_REQUIRED",
  "TELEGRAM_POST_CONTENT_REQUIRED",
  "TELEGRAM_POST_INVALID_SCHEDULE",
  "TELEGRAM_POST_SCHEDULE_IN_PAST",
  "TELEGRAM_POST_INVALID_TIMEZONE",
  "TELEGRAM_POST_ALREADY_IN_TARGET_CHANNEL",
  "TELEGRAM_POST_GROUP_ALREADY_IN_TARGET_CHANNEL",
  "TELEGRAM_POST_PUBLISH_FAILED",
  "TELEGRAM_POST_IMPORT_ROW_INVALID",
  "TELEGRAM_POST_NOT_EDITABLE",
  "TELEGRAM_POST_NOT_SCHEDULED",
  "TELEGRAM_POST_BATCH_LIMIT_EXCEEDED",
  "TELEGRAM_POST_IMAGES_NOT_EDITABLE",
  "TELEGRAM_POST_MEDIA_NOT_REPLACEABLE",
  "TELEGRAM_POST_PUBLISH_SOURCE_UNAVAILABLE",
  "TELEGRAM_POST_TELEGRAM_REFERENCE_MISSING",
  "TELEGRAM_POST_PLANNER_RANGE_INVALID",
  "TELEGRAM_POST_PLANNER_NO_ASSIGNMENTS",
  "TELEGRAM_POST_PLANNER_FORMAT_NOT_FOUND",
  "TELEGRAM_POST_PLANNER_SLOT_NOT_FOUND",
  "TELEGRAM_POST_CALENDAR_RANGE_INVALID",
  "TELEGRAM_POST_CALENDAR_RANGE_TOO_LARGE",
  "TELEGRAM_POST_MANUAL_LINK_BLOCKED",
  "TELEGRAM_POST_LINK_INVALID",
  "TELEGRAM_POST_LINK_CHANNEL_MISMATCH",
  "TELEGRAM_POST_MEDIA_URL_INVALID",
  "TELEGRAM_POST_MEDIA_EMPTY",
  "TELEGRAM_POST_MEDIA_TOO_LARGE",
  "TELEGRAM_POST_MEDIA_INVALID",
] as const;

export type TelegramPostsErrorCode =
  (typeof TELEGRAM_POSTS_ERROR_CODES)[number];

export const TELEGRAM_POSTS_ERROR_KEYS: Readonly<
  Record<TelegramPostsErrorCode, string>
> = {
  TELEGRAM_CHANNEL_NOT_FOUND: "telegramPosts.errors.channelNotFound",
  TELEGRAM_MANAGED_POST_NOT_FOUND: "telegramPosts.errors.postNotFound",
  TELEGRAM_POST_GROUP_NOT_FOUND: "telegramPosts.errors.groupNotFound",
  TELEGRAM_POST_TITLE_REQUIRED: "telegramPosts.errors.titleRequired",
  TELEGRAM_POST_ASSIGNED_MEMBER_REQUIRED:
    "telegramPosts.errors.assignedMemberRequired",
  TELEGRAM_POST_CONTENT_REQUIRED: "telegramPosts.errors.contentRequired",
  TELEGRAM_POST_INVALID_SCHEDULE: "telegramPosts.errors.invalidSchedule",
  TELEGRAM_POST_SCHEDULE_IN_PAST: "telegramPosts.errors.scheduleInPast",
  TELEGRAM_POST_INVALID_TIMEZONE: "telegramPosts.errors.invalidTimezone",
  TELEGRAM_POST_ALREADY_IN_TARGET_CHANNEL:
    "telegramPosts.errors.alreadyInTargetChannel",
  TELEGRAM_POST_GROUP_ALREADY_IN_TARGET_CHANNEL:
    "telegramPosts.errors.groupAlreadyInTargetChannel",
  TELEGRAM_POST_PUBLISH_FAILED: "telegramPosts.errors.publishFailed",
  TELEGRAM_POST_IMPORT_ROW_INVALID: "telegramPosts.errors.importRowInvalid",
  TELEGRAM_POST_NOT_EDITABLE: "telegramPosts.errors.notEditable",
  TELEGRAM_POST_NOT_SCHEDULED: "telegramPosts.errors.notScheduled",
  TELEGRAM_POST_BATCH_LIMIT_EXCEEDED: "telegramPosts.errors.batchLimitExceeded",
  TELEGRAM_POST_IMAGES_NOT_EDITABLE: "telegramPosts.errors.imagesNotEditable",
  TELEGRAM_POST_MEDIA_NOT_REPLACEABLE:
    "telegramPosts.errors.mediaNotReplaceable",
  TELEGRAM_POST_PUBLISH_SOURCE_UNAVAILABLE:
    "telegramPosts.errors.publishSourceUnavailable",
  TELEGRAM_POST_TELEGRAM_REFERENCE_MISSING:
    "telegramPosts.errors.telegramReferenceMissing",
  TELEGRAM_POST_PLANNER_RANGE_INVALID:
    "telegramPosts.errors.plannerRangeInvalid",
  TELEGRAM_POST_PLANNER_NO_ASSIGNMENTS:
    "telegramPosts.errors.plannerNoAssignments",
  TELEGRAM_POST_PLANNER_FORMAT_NOT_FOUND:
    "telegramPosts.errors.plannerFormatNotFound",
  TELEGRAM_POST_PLANNER_SLOT_NOT_FOUND:
    "telegramPosts.errors.plannerSlotNotFound",
  TELEGRAM_POST_CALENDAR_RANGE_INVALID:
    "telegramPosts.errors.calendarRangeInvalid",
  TELEGRAM_POST_CALENDAR_RANGE_TOO_LARGE:
    "telegramPosts.errors.calendarRangeTooLarge",
  TELEGRAM_POST_MANUAL_LINK_BLOCKED: "telegramPosts.errors.manualLinkBlocked",
  TELEGRAM_POST_LINK_INVALID: "telegramPosts.errors.linkInvalid",
  TELEGRAM_POST_LINK_CHANNEL_MISMATCH:
    "telegramPosts.errors.linkChannelMismatch",
  TELEGRAM_POST_MEDIA_URL_INVALID: "telegramPosts.errors.mediaUrlInvalid",
  TELEGRAM_POST_MEDIA_EMPTY: "telegramPosts.errors.mediaEmpty",
  TELEGRAM_POST_MEDIA_TOO_LARGE: "telegramPosts.errors.mediaTooLarge",
  TELEGRAM_POST_MEDIA_INVALID: "telegramPosts.errors.mediaInvalid",
};
import type {
  TelegramAdSaleComputedPaymentStatus,
  TelegramAdSaleStatus,
} from "../types/telegram-ad-sales";
import type { TelegramAdPlacementStatus } from "../types/telegram-ad-sales-status";
