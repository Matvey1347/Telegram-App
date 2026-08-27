import {
  Prisma,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import type {
  BulkActionResultItem,
  TelegramChannelSyncProgressItem,
  TelegramManagedPostOrigin,
  TelegramManagedPostsImportProgressItem,
} from '@telegram-system/shared';

export type BulkProgressCallback = (
  item: BulkActionResultItem | TelegramChannelSyncProgressItem,
  current: number,
  total: number,
) => void | Promise<void>;

export const TELEGRAM_IMPORTED_SYSTEM_GROUP_KEY = 'TELEGRAM_IMPORTED';

export const TELEGRAM_IMPORTED_SYSTEM_GROUP_TITLE = 'Created in Telegram';

export const ADVERTISE_SYSTEM_GROUP_KEY = 'ADVERTISE';

export const ADVERTISE_SYSTEM_GROUP_TITLE = 'Advertise';

export const ADVERTISE_SYSTEM_GROUP_ICON = '💰';

export const SYSTEM_BOT_POSTS_GROUP_KEY = 'SYSTEM_BOT_POSTS';

export const SYSTEM_BOT_POSTS_GROUP_TITLE = 'System Bot posts';

export const SYSTEM_BOT_POSTS_GROUP_ICON_NAME =
  'telegram-system-service-group-icon';

export const SYSTEM_BOT_POSTS_GROUP_ICON_IMAGE_URL =
  '/brand/telegram-system.png';

export const TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_NAME =
  'telegram-system-group-icon';

export const TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL =
  'https://telegram.org/img/t_logo.png';

export const TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_FALLBACK_ID =
  'telegram-system-group-icon';

export type TelegramChannelSyncSelection = {
  syncIncludePublicInfo: boolean;
  syncIncludeInviteLinks: boolean;
  syncIncludeHistoricalPosts: boolean;
  syncIncludePostMetrics: boolean;
  syncIncludeOlderPosts: boolean;
  syncIncludeChannelStats: boolean;
  syncIncludeManagedPosts: boolean;
  syncIncludeAudienceSnapshot: boolean;
};

export type TelegramImportPolicyInput = {
  acquisitionType?: 'CREATED' | 'PURCHASED';
  postsSyncFrom?: string | Date | null;
  inviteLinksSyncFrom?: string | Date | null;
  purchaseTransactionId?: string | null;
};

export type ResolvedTelegramImportPolicy = {
  acquisitionType: 'CREATED' | 'PURCHASED';
  postsSyncFrom: Date | null;
  inviteLinksSyncFrom: Date | null;
  purchaseTransactionId: string | null;
};

export const TELEGRAM_BROADCAST_STATS_MIN_SUBSCRIBERS = 50;

export const TELEGRAM_CAPTION_LIMIT = 1024;

export const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;

export type BotMessageEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
  custom_emoji_id?: string;
};

export type ManagedPostPublishRender = {
  html: string;
  richHtml: string | null;
  captionHtml: string;
  followupHtmlParts: string[];
  textHtmlParts: string[];
  publishMode: string;
};

export type TelegramPostRenderingLimits = {
  captionLengthMax: number;
  messageLengthMax: number;
};

export type ManagedPostSyncMessage = {
  id: string;
  text: string;
  html: string;
  date: string | null;
  isScheduled: boolean;
  hasMedia: boolean;
  mediaKind: string | null;
  groupedId: string | null;
};

export type TelegramTextEditOutcome = {
  updatedCount: number;
  unchangedCount: number;
};

export type ManagedPostRevisionSource = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  title: string;
  text: string | null;
  imageUrls: string[];
  buttonRows?: Prisma.JsonValue | null;
  origin: TelegramManagedPostOrigin;
  remoteImportKey: string | null;
  status: TelegramManagedPostStatus;
  scheduledAt: Date | null;
  scheduleMode?: string | null;
  publishedAt: Date | null;
  telegramScheduledMessageIds: string[];
  telegramMessageIds: string[];
  telegramMessageUrls: string[];
  telegramIdVerificationStatus: TelegramManagedPostIdVerificationStatus;
  telegramLinkSource: TelegramManagedPostLinkSource;
  telegramIdVerifiedAt: Date | null;
  telegramIdLastCheckedAt: Date | null;
  telegramRemoteStatus: TelegramManagedPostRemoteStatus;
  lastTelegramSyncedAt: Date | null;
  lastTelegramSyncNote: string | null;
  sourceType: TelegramSourceType | null;
  sourceId: string | null;
  publishMode: string | null;
  lastError: string | null;
  assignedMemberId: string;
  icon: string | null;
  groupId: string | null;
  groupPosition: number | null;
  statusPosition: number | null;
  sidebarPosition: number | null;
};

export type ManagedPostRevisionRecord = ManagedPostRevisionSource & {
  id: string;
  reason: string;
  createdAt: Date;
};

export type NormalizedManagedPostImportRow = {
  title: string;
  text: string | null;
  imageUrls: string[];
  icon: string | null;
  groupId: string | null | undefined;
  scheduledAt: Date | null;
};

export type ManagedPostImportResultRow =
  | {
      index: number;
      status: 'skipped';
      error: string;
    }
  | {
      index: number;
      status: 'created';
      post: unknown;
    }
  | { index: number; status: 'alreadyExists'; post: unknown }
  | {
      index: number;
      status: 'scheduled' | 'scheduleFailed';
      post: unknown;
      error?: string;
    };

export type ManagedPostImportProgressHandler = (
  item: TelegramManagedPostsImportProgressItem,
  current: number,
  total: number,
) => void;
