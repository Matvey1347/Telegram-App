import type { MemberSummary, ResolvedEmoji } from "../core";
import type { TelegramChannel } from "./telegram-channels";
import type {
  TelegramPostButtonRows,
  TelegramPostEngagementMetrics,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
} from "@telegram-system/shared";

export type TelegramPost = {
  id: string;
  telegramChannelId: string;
  telegramMessageId: string;
  primaryTelegramMessageUrl?: string | null;
  postDate: string;
  text?: string | null;
  formattedText?: string | null;
  hasMedia?: boolean;
  mediaKind?: string | null;
  imageUrls: string[];
  viewsCount?: number | null;
  forwardsCount?: number | null;
  reactionsCount?: number | null;
  commentsCount?: number | null;
  manualOwnViews: number;
  manualOwnReactions: number;
  excludeFromAnalytics: boolean;
  reactions?: Array<{ reaction: string; count: number }> | null;
};
export type TelegramManagedPostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED";
export type TelegramManagedPostRemoteStatus =
  | "NONE"
  | "SCHEDULED"
  | "PUBLISHED"
  | "BROKEN"
  | "MISSING"
  | "UNKNOWN";
export type TelegramManagedPostScheduleMode = "TELEGRAM_NATIVE" | "LOCAL";
export type TelegramManagedPostGroupSummary = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  title: string;
  icon?: string | null;
  iconPresentation?: ResolvedEmoji | null;
  isSystem?: boolean;
  systemKey?: string | null;
  statusNumberingEnabled?: boolean;
  sidebarPosition?: number | null;
};
export type TelegramManagedPost = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  origin: "SYSTEM" | "TELEGRAM";
  assignedMemberId: string;
  assignedMember: MemberSummary;
  icon?: string | null;
  iconPresentation?: ResolvedEmoji | null;
  groupId?: string | null;
  groupPosition?: number | null;
  statusPosition?: number | null;
  sidebarPosition?: number | null;
  group?: TelegramManagedPostGroupSummary | null;
  title: string;
  telegramPostId?: string | null;
  text?: string | null;
  formattedText?: string | null;
  hasMedia?: boolean;
  imageUrls: string[];
  buttonRows?: TelegramPostButtonRows;
  status: TelegramManagedPostStatus;
  scheduledAt?: string | null;
  scheduleMode?: TelegramManagedPostScheduleMode | null;
  publishedAt?: string | null;
  telegramScheduledMessageIds: string[];
  telegramMessageIds: string[];
  telegramMessageUrls: string[];
  primaryTelegramMessageUrl?: string | null;
  readOnlyTelegramPost?: boolean;
  engagementMetrics?: TelegramPostEngagementMetrics[];
  telegramIdVerificationStatus: TelegramManagedPostIdVerificationStatus;
  telegramLinkSource: TelegramManagedPostLinkSource;
  telegramIdVerifiedAt?: string | null;
  telegramIdLastCheckedAt?: string | null;
  telegramRemoteStatus: TelegramManagedPostRemoteStatus;
  lastTelegramSyncedAt?: string | null;
  lastTelegramSyncNote?: string | null;
  sourceWasPremium?: boolean | null;
  captionLengthMaxUsed?: number | null;
  messageLengthMaxUsed?: number | null;
  publishMode?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TelegramManagedPostsImportRow = {
  title?: unknown;
  text?: unknown;
  icon?: unknown;
  emoji?: unknown;
  iconText?: unknown;
  urls?: unknown;
  imageUrls?: unknown;
  images?: unknown;
  imageSearch?: unknown;
  groupId?: unknown;
  scheduledAt?: unknown;
  imported?: unknown;
  approved?: unknown;
};
export type TelegramManagedPostsImportPayload = {
  postGroupId?: string | null;
  assignedMemberId?: string;
  rows: TelegramManagedPostsImportRow[];
};
export type TelegramManagedPostsImportResultRow =
  | {
      index: number;
      status: "skipped" | "failed";
      error: string;
    }
  | {
      index: number;
      status: "created";
      post: TelegramManagedPost;
    }
  | { index: number; status: "alreadyExists"; post: TelegramManagedPost }
  | {
      index: number;
      status: "scheduled" | "scheduleFailed";
      post: TelegramManagedPost;
      error?: string;
    };
export type TelegramManagedPostsImportResult = {
  createdCount: number;
  skippedCount: number;
  rows: TelegramManagedPostsImportResultRow[];
};
export type TelegramManagedPostsImportProgressItem = {
  index: number;
  status:
    | "created"
    | "skipped"
    | "alreadyExists"
    | "scheduled"
    | "scheduleFailed"
    | "failed";
  title?: string;
  postId?: string;
  error?: string;
  message: string;
};
export type TelegramManagedPostRevision = {
  id: string;
  telegramManagedPostId: string;
  workspaceId: string;
  telegramChannelId: string;
  title: string;
  text?: string | null;
  imageUrls: string[];
  buttonRows?: TelegramPostButtonRows;
  status: TelegramManagedPostStatus;
  scheduledAt?: string | null;
  scheduleMode?: TelegramManagedPostScheduleMode | null;
  publishedAt?: string | null;
  telegramScheduledMessageIds: string[];
  telegramMessageIds: string[];
  telegramMessageUrls: string[];
  telegramIdVerificationStatus: TelegramManagedPostIdVerificationStatus;
  telegramLinkSource: TelegramManagedPostLinkSource;
  telegramIdVerifiedAt?: string | null;
  telegramIdLastCheckedAt?: string | null;
  telegramRemoteStatus: TelegramManagedPostRemoteStatus;
  lastTelegramSyncedAt?: string | null;
  lastTelegramSyncNote?: string | null;
  sourceWasPremium?: boolean | null;
  captionLengthMaxUsed?: number | null;
  messageLengthMaxUsed?: number | null;
  publishMode?: string | null;
  lastError?: string | null;
  assignedMemberId: string;
  icon?: string | null;
  iconPresentation?: ResolvedEmoji | null;
  groupId?: string | null;
  groupPosition?: number | null;
  statusPosition?: number | null;
  sidebarPosition?: number | null;
  reason: string;
  createdAt: string;
};
export type TelegramManagedPostLinkTarget = {
  id: string;
  title: string;
  icon?: string | null;
  iconPresentation?: ResolvedEmoji | null;
  status: TelegramManagedPostStatus;
  telegramRemoteStatus: TelegramManagedPostRemoteStatus;
  groupId?: string | null;
  groupTitle?: string | null;
  telegramChannelId: string;
  telegramChannelTitle: string;
  publishedAt?: string | null;
  primaryTelegramMessageUrl?: string | null;
};
export type PostGroupStatusSummary = {
  totalPosts: number;
  draftCount: number;
  scheduledCount: number;
  publishedCount: number;
  failedCount: number;
  computedStatus:
    | "EMPTY"
    | "HAS_ERRORS"
    | "ALL_DRAFT"
    | "ALL_SCHEDULED"
    | "ALL_PUBLISHED"
    | "MIXED";
};
export type PostGroup = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  iconPresentation?: ResolvedEmoji | null;
  isSystem?: boolean;
  systemKey?: string | null;
  statusNumberingEnabled?: boolean;
  createdByMemberId: string;
  sidebarPosition?: number | null;
  createdByMember: MemberSummary;
  telegramChannel?: Pick<TelegramChannel, "id" | "title">;
  posts?: TelegramManagedPost[];
  postsCount?: number;
  statusSummary: PostGroupStatusSummary;
  createdAt: string;
  updatedAt: string;
};

export type TelegramPostAnalyticsItem = {
  id: string;
  telegramMessageId: string;
  postDate: string;
  text?: string | null;
  viewsCount?: number | null;
  forwardsCount?: number | null;
  reactionsCount?: number | null;
  commentsCount?: number | null;
  manualOwnViews?: number;
  manualOwnReactions?: number;
  excludeFromAnalytics?: boolean;
  reactions?: Array<{ reaction: string; count: number }> | null;
  reactionRateByViews?: number | null;
  commentsRateByViews?: number | null;
  reactionRateBySubscribers?: number | null;
  commentsRateBySubscribers?: number | null;
  viewsRateBySubscribers?: number | null;
  primaryTelegramMessageUrl?: string | null;
};
