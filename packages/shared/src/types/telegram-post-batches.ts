import type { TelegramPostButtonRows } from "./telegram-post-buttons";
import type { TelegramPostMediaItem } from "./telegram-post-media";
import type { ResolvedEmoji } from "./resolved-emoji";

export const TELEGRAM_POST_BATCH_MAX_POSTS = 50;
export const TELEGRAM_POST_BATCH_MAX_CHANNELS = 100;
export const TELEGRAM_POST_BATCH_MAX_DELIVERIES = 5_000;

export type TelegramPostBatchAction = "PUBLISH_NOW" | "SCHEDULE";
export type TelegramPostBatchLifetimeHours = 24 | 48 | 72 | null;
export type TelegramPostBatchLongTextMode =
  | "IMAGES_THEN_TEXT"
  | "CAPTION_THEN_TEXT";
export type TelegramPostBatchStatus =
  | "DRAFT"
  | "DISPATCHING"
  | "ACTIVE"
  | "COMPLETED"
  | "PARTIAL_FAILURE"
  | "CANCELLED";
export type TelegramPostBatchDeliveryStatus =
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "DELETING"
  | "DELETED"
  | "FAILED"
  | "DELETE_FAILED"
  | "CANCELLED";

export type TelegramPostBatchChannelOverride = {
  telegramChannelId: string;
  action?: TelegramPostBatchAction;
  scheduledAt?: string | null;
};

export type TelegramPostBatchPost = {
  id: string;
  position: number;
  title: string;
  iconId: string | null;
  iconPresentation: ResolvedEmoji | null;
  text: string | null;
  imageUrls: string[];
  mediaItems: TelegramPostMediaItem[];
  buttonRows: TelegramPostButtonRows;
  action: TelegramPostBatchAction;
  scheduledAt: string | null;
  deleteAfterHours: TelegramPostBatchLifetimeHours;
  longTextMode: TelegramPostBatchLongTextMode;
  channelOverrides: TelegramPostBatchChannelOverride[];
};

export type TelegramPostBatchDelivery = {
  id: string;
  postId: string;
  postTitle: string;
  telegramChannel: {
    id: string;
    title: string;
    photoUrl: string | null;
  };
  managedPostId: string;
  telegramMessageUrls: string[];
  telegramRemoteStatus:
    | "NONE"
    | "SCHEDULED"
    | "PUBLISHED"
    | "BROKEN"
    | "MISSING"
    | "AUTO_DELETED"
    | "UNKNOWN";
  action: TelegramPostBatchAction;
  scheduledAt: string;
  deleteAfterHours: TelegramPostBatchLifetimeHours;
  status: TelegramPostBatchDeliveryStatus;
  publishedAt: string | null;
  deleteAt: string | null;
  deletedAt: string | null;
  attemptCount: number;
  lastError: string | null;
};

export type TelegramPostBatchSummary = {
  id: string;
  title: string;
  status: TelegramPostBatchStatus;
  version: number;
  postCount: number;
  channelCount: number;
  deliveryCount: number;
  scheduledCount: number;
  publishedCount: number;
  failedCount: number;
  nextPublicationAt: string | null;
  nextDeleteAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelegramPostBatch = TelegramPostBatchSummary & {
  channelIds: string[];
  defaultDeleteAfterHours: TelegramPostBatchLifetimeHours;
  posts: TelegramPostBatchPost[];
};

export type TelegramPostBatchListResponse = {
  items: TelegramPostBatchSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type TelegramPostBatchDeliveryPage = {
  items: TelegramPostBatchDelivery[];
  pagination: TelegramPostBatchListResponse["pagination"];
};

export type UpdateTelegramPostBatchPostInput = Omit<
  TelegramPostBatchPost,
  "position" | "iconPresentation"
>;

export type CreateTelegramPostBatchPostInput = Omit<
  UpdateTelegramPostBatchPostInput,
  "id"
>;

export type UpdateTelegramPostBatchPayload = {
  expectedVersion: number;
  title: string;
  channelIds: string[];
  defaultDeleteAfterHours: TelegramPostBatchLifetimeHours;
  posts: UpdateTelegramPostBatchPostInput[];
};

export type TelegramPostBatchDispatchResult = {
  batch: TelegramPostBatch;
  queuedDeliveries: number;
  alreadyQueued: boolean;
};

export type CreateTelegramPostBatchPayload = {
  title?: string;
  channelIds: string[];
};

export type CreateAndDispatchTelegramPostBatchPayload = {
  title: string;
  channelIds: string[];
  defaultDeleteAfterHours: TelegramPostBatchLifetimeHours;
  posts: CreateTelegramPostBatchPostInput[];
};
