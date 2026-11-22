"use client";

import { type ManagedPostStatusTab } from "@/components/features/telegram/telegram/managed-post-deep-link";
import { type TelegramPostsRouteView } from "@/lib/features/telegram/telegram-posts-url";
import { type TelegramManagedPostEditorialPair, type TelegramPostPlannerSlot } from "@telegram-system/shared";
import {
  type ResolvedEmoji,
  type TelegramManagedPost,
  type PostGroup,
  type TelegramChannelTimePost,
  type TelegramChannelSelectOption as TelegramChannel,
} from "@/lib/api";
import {
  channelLocalDateKey,
  channelLocalTime,
} from "@/lib/features/growth/telegram-ad-sales";
import { type TranslationFunction } from "@/providers/i18n-provider";
import { type ChannelImportMode } from "@/components/features/telegram/telegram/channel-import-navigation";

export type PublishingMode = "draft" | "publish" | "schedule";

export type PostStatusTab = ManagedPostStatusTab;

export type PostViewMode = Exclude<
  TelegramPostsRouteView,
  "groups" | "hypotheses"
>;

export type TelegramPostsPageProps = {
  routeChannelId?: string | null;
  routePostView?: TelegramPostsRouteView | null;
};

export type PendingPostSave = {
  id: string;
  title: string;
  icon?: string | null;
  groupId?: string | null;
  mode: PublishingMode;
};

export type PlannerSlotDraft = {
  timePostIds: string[];
  groupIds: string[];
};

export type PlannerSlotEditDraft = PlannerSlotDraft;

export type PlannerSlotDisplayGroup = {
  id: string;
  slots: TelegramPostPlannerSlot[];
  timePostIds: string[];
  groupIds: string[];
};

export type PlannerFormatDraft = {
  name: string;
  icon: string;
};

export function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

export function plannerSlotDisplayGroupKey(slot: TelegramPostPlannerSlot) {
  return [
    [...slot.postGroupIds].sort().join("|") || "any",
    slot.weekday ?? "any-day",
    slot.timezone ?? "local",
    slot.isActive ? "active" : "inactive",
  ].join("::");
}

export const plannerFormatWeightsPreferenceKey = (channelId: string) =>
  `telegram-posts-planner-format-weights:${channelId}`;

export function selectIconProps(icon?: ResolvedEmoji | null) {
  if (!icon) return {};
  if (icon.type === "image") return { iconUrl: icon.url };
  return { iconEmoji: icon.value };
}

export function plannerFormatResolvedIcon(
  icon?: string | null,
): ResolvedEmoji | null {
  const value = icon?.trim();
  return value ? { type: "unicode", value, name: value } : null;
}

export type PostSidebarSection = {
  key: string;
  group: EffectivePostGroup | null;
  editorial?: Pick<TelegramManagedPostEditorialPair, "sphereName" | "rubricName" | "sphereIcon" | "rubricIcon">;
  posts: TelegramManagedPost[];
  pendingPosts: PendingPostSave[];
};

export type EffectivePostGroup =
  | PostGroup
  | NonNullable<TelegramManagedPost["group"]>;

export const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;

export const POST_OPEN_CLICK_DELAY_MS = 180;

export const lastSelectedTelegramPostsChannelKey =
  "telegram-posts:last-selected-channel";

export const postGroupPreferenceKey = (channelId: string) =>
  `telegram-posts-new-post-group:${channelId}`;

export function localNowParts(timezone: string) {
  const now = new Date();
  return localDateTimeParts(now, timezone);
}

export function localDateTimeParts(value: string | Date, timezone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      date: "",
      time: "",
    };
  }
  return {
    date: channelLocalDateKey(date, timezone),
    time: channelLocalTime(date, timezone),
  };
}

export function shouldIgnoreModifiedPostOpen(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, input, select, textarea, [role="button"], [role="checkbox"], [role="combobox"]',
    ),
  );
}

export function isBrokenPublishedPost(post: TelegramManagedPost) {
  return (
    post.status === "PUBLISHED" &&
    ["BROKEN", "MISSING"].includes(post.telegramRemoteStatus)
  );
}

export function remoteStatusKey(status: string) {
  if (status === "PUBLISHED") return "telegramPosts.status.published" as const;
  if (status === "SCHEDULED") return "telegramPosts.status.scheduled" as const;
  if (status === "MISSING")
    return "telegram.posts.remoteStatus.missing" as const;
  if (status === "BROKEN") return "telegram.posts.remoteStatus.broken" as const;
  return status === "AUTO_DELETED"
    ? ("telegram.posts.remoteStatus.autoDeleted" as const)
    : ("telegram.posts.remoteStatus.unknown" as const);
}

export function formatManagedPostRevisionReason(
  t: TranslationFunction,
  reason: string,
) {
  switch (reason) {
    case "before_update":
      return t("telegram.posts.history.beforeEdit");
    case "before_publish":
      return t("telegram.posts.history.beforePublish");
    case "before_schedule":
      return t("telegram.posts.history.beforeSchedule");
    case "before_manual_link":
      return t("telegram.posts.history.beforeManualLink");
    case "before_sync_missing":
      return t("telegram.posts.history.beforeSyncMissing");
    case "before_sync_broken":
      return t("telegram.posts.history.beforeSyncBroken");
    case "before_sync_publish_transition":
      return t("telegram.posts.history.beforeSyncPublished");
    case "before_sync_update":
      return t("telegram.posts.history.beforeSyncUpdate");
    case "before_restore":
      return t("telegram.posts.history.beforeRestore");
    case "before_delete":
      return t("telegram.posts.history.beforeDelete");
    default:
      return t("telegram.posts.history.change");
  }
}

export function scheduleDateForPreset(time: string, timezone: string) {
  const now = new Date();
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  const candidate = new Date(now);
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate.getTime() < now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return localDateTimeParts(candidate, timezone).date;
}

export type TelegramPostWorkspaceProps = {
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  channelUsername?: string | null;
  channelTelegramChatId?: string | null;
  channelTimePosts: TelegramChannelTimePost[];
  channelPublishingCapabilities?: {
    source: { sourceId: string } | null;
    captionLengthMax: number;
    messageLengthMax: number;
    canPublishInlineButtons: boolean;
  } | null;
  workspaceTimezone: string;
  newPostToken: number;
  importMode: ChannelImportMode | null;
  onImportModeChange: (mode: ChannelImportMode | null) => void;
  initialPostId: string;
  initialPostView: PostViewMode;
  channels: TelegramChannel[];
  onRequestNewPost: () => void;
  onPostSelect: (postId: string | null) => void;
};
