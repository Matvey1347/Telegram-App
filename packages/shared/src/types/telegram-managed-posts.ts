import type { BulkActionResult } from "./post-groups";
import type { ResolvedEmoji } from "./resolved-emoji";

/** Maximum IDs accepted by one workspace- and channel-scoped lookup request. */
export const TELEGRAM_MANAGED_POST_LOOKUP_MAX_IDS = 1_000;

/** Maximum channel group summaries returned by the bounded sidebar contract. */
export const TELEGRAM_POST_GROUP_SUMMARY_MAX_ITEMS = 1_000;

export type TelegramManagedPostLookupItem = {
  id: string;
  title: string;
  icon: string | null;
  iconPresentation: ResolvedEmoji | null;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "FAILED";
  scheduledAt: string | null;
  publishedAt: string | null;
  telegramRemoteStatus:
    | "NONE"
    | "SCHEDULED"
    | "PUBLISHED"
    | "BROKEN"
    | "MISSING"
    | "UNKNOWN";
  telegramMessageIds: string[];
  telegramIdVerificationStatus: TelegramManagedPostIdVerificationStatus;
  lastError: string | null;
};

export type TelegramManagedPostLookupRequest = { ids: string[] };

export type TelegramManagedPostLookupResponse = {
  items: TelegramManagedPostLookupItem[];
  missingIds: string[];
};

export type TelegramManagedPostOrigin = "SYSTEM" | "TELEGRAM";
export type TelegramManagedPostIdVerificationStatus =
  | "UNVERIFIED"
  | "VERIFIED"
  | "MISMATCH"
  | "MISSING";
export type TelegramManagedPostLinkSource = "AUTO" | "MANUAL";

export function buildTelegramGptContextFilename(
  channelTitle: string,
  downloadedAt = new Date(),
) {
  const words = channelTitle.match(/[\p{L}\p{N}]+/gu) ?? [];
  const firstWord = Array.from(words[0] ?? "TG");
  const secondWord = Array.from(words[1] ?? "");
  const prefix =
    secondWord.length > 0
      ? `${firstWord[0] ?? "T"}${secondWord[0] ?? "G"}`
      : firstWord.slice(0, 2).join("");
  const time = [
    String(downloadedAt.getHours()).padStart(2, "0"),
    String(downloadedAt.getMinutes()).padStart(2, "0"),
  ].join("-");
  return `${prefix.toUpperCase()}_${time}.txt`;
}

export function buildTelegramCalendarPlanInstructionFilename(
  channelTitle: string,
  downloadedAt = new Date(),
) {
  return buildTelegramGptContextFilename(channelTitle, downloadedAt).replace(
    /\.txt$/,
    "_calendar-plan-instruction.txt",
  );
}

export type TelegramPostEngagementMetrics = {
  telegramPostId: string;
  telegramMessageId: string;
  viewsCount: number | null;
  forwardsCount: number | null;
  reactionsCount: number | null;
  commentsCount: number | null;
  adjustedViewsCount: number;
  adjustedReactionsCount: number;
  subscriberCount: number | null;
  err: number | null;
  reactionRate: number | null;
  forwardRate: number | null;
  commentRate: number | null;
  reactions: Array<{ reaction: string; count: number }> | null;
};

export type TelegramManagedPostIdentityFields = {
  telegramScheduledMessageIds: string[];
  telegramMessageIds: string[];
  telegramMessageUrls: string[];
  telegramIdVerificationStatus: TelegramManagedPostIdVerificationStatus;
  telegramLinkSource: TelegramManagedPostLinkSource;
  telegramIdVerifiedAt: string | null;
  telegramIdLastCheckedAt: string | null;
};

export type TelegramManagedPostVerificationResult = {
  checked: number;
  verified: number;
  corrected: number;
  manualMismatch: number;
  missing: number;
  skipped: number;
};

export type ManagedPostsSyncResult = {
  checked: number;
  updated: number;
  importedScheduled: number;
  remoteScheduledTotal: number;
  publishedEarly: number;
  movedToDraft: number;
  broken: number;
  missing: number;
};

export type ResetChannelScheduledPostsResult = {
  action: "RESET_CHANNEL_SCHEDULED_TO_DRAFT";
  channelId: string;
  remoteScheduledDeletedCount: number;
  postsReturnedToDraftCount: number;
  postIds: string[];
};

export type TelegramManagedPostCalendarItem = {
  id: string;
  telegramChannelId: string;
  title: string;
  text?: string | null;
  status: "SCHEDULED" | "PUBLISHED";
  scheduledAt?: string | null;
  publishedAt?: string | null;
  origin: TelegramManagedPostOrigin;
  telegramRemoteStatus: string;
  telegramMessageUrls: string[];
  telegramIdVerificationStatus: TelegramManagedPostIdVerificationStatus;
  telegramLinkSource: TelegramManagedPostLinkSource;
  hasMedia: boolean;
  plannerFormatId?: string | null;
  plannerSlotId?: string | null;
  plannerRunId?: string | null;
  plannerPlannedAt?: string | null;
  plannerProvenance?: unknown;
  isAutoPlanned?: boolean;
  group?: {
    id: string;
    title: string;
    icon?: string | null;
  } | null;
  assignedMember: {
    id: string;
    workspaceId: string;
    name: string;
    email?: string | null;
    photoUrl?: string | null;
    role?: string | null;
  };
};

export type TelegramManagedPostCalendarResult = {
  from: string;
  to: string;
  items: TelegramManagedPostCalendarItem[];
  summary: {
    scheduledInRange: number;
    publishedInRange: number;
    futureScheduledTotal: number;
    lastScheduledAt: string | null;
  };
};

export type ScheduleManagedPostsBatchItem = {
  postId: string;
  scheduledAt: string;
  longTextMode?: "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT";
};

export type ScheduleManagedPostsBatchPayload = {
  items: ScheduleManagedPostsBatchItem[];
};

export type ScheduleManagedPostsBatchResult = BulkActionResult & {
  action: BulkActionResult["action"] | "SCHEDULE_BATCH";
};

export type TelegramPostPlannerFormat = {
  id: string;
  telegramChannelId: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
  isActive: boolean;
};

export type TelegramPostPlannerSlot = {
  id: string;
  telegramChannelId: string;
  formatId: string | null;
  postGroupIds: string[];
  weekday: number;
  time: string;
  timezone: string;
  position: number;
  isActive: boolean;
};

export type TelegramPostPlannerAssignment = {
  postId: string;
  title: string;
  scheduledAt: string;
  date: string;
  slotId: string;
  formatId: string | null;
  groupId: string | null;
  provenance: {
    planner: "telegram_posts_auto_calendar";
    reason: string;
    slotId: string;
    formatId: string | null;
    groupId: string | null;
    generatedAt: string;
  };
};

export type TelegramPostPlannerPreviewResult = {
  from: string;
  to: string;
  timezone: string;
  assignments: TelegramPostPlannerAssignment[];
  summary: {
    eligiblePosts: number;
    availableSlots: number;
    plannedPosts: number;
    unfilledSlots: number;
  };
};

export type TelegramPostPlannerPreviewPayload = {
  from: string;
  to: string;
  timezone?: string;
  postGroupIds?: string[];
  formatIds?: string[];
  formatWeights?: Record<string, number>;
  limit?: number;
  rerollOffset?: number;
  excludePostIds?: string[];
};

export type TelegramPostPlannerApplyResult = {
  plannerRunId: string;
  preview: TelegramPostPlannerPreviewResult;
  schedule: ScheduleManagedPostsBatchResult;
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
