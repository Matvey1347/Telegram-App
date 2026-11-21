"use client";

import type { LongTextMode } from "../managed-post-presentation";

import { useEffect, useMemo } from "react";
import { telegramSyncedPostGroup } from "@/components/features/telegram/telegram/telegram-synced-post-group";
import {
  type TelegramManagedPost,
  telegramChannelsApi,
  type TelegramChannelSelectOption as TelegramChannel,
} from "@/lib/api";
import { extractAutoPrefilledPostTitle } from "@/lib/features/telegram/telegram-post-title";
import { useManagedPostDueRefresh } from "@/components/features/telegram/telegram/use-managed-post-due-refresh";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
import {
  buildManagedPostInternalLinks,
  hasBlockingManagedPostInternalLinks,
} from "@/components/features/telegram/telegram/managed-post-internal-links-notice";
import {
  isValidTimeInputValue,
  canonicalizeTimeInputValue,
} from "@/components/ui/primitives";
import { zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import { telegramChannelKeys } from "@/lib/query-keys";
import {
  postGroupPreferenceKey,
  type PublishingMode,
  TELEGRAM_TEXT_MESSAGE_LIMIT,
} from "./telegram-post-workspace-model";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";
import type { useTelegramPostSidebarState } from "./use-telegram-post-sidebar-state";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramPostPendingState } from "./use-telegram-post-pending-state";

type Input = Pick<
  ReturnType<typeof useTelegramWorkspaceView>,
  | "workspaceView"
  | "postView"
  | "queryClient"
  | "t"
  | "pushToast"
  | "localizedApiError"
> &
  Pick<
    TelegramPostWorkspaceProps,
    | "channelId"
    | "channelTelegramChatId"
    | "channelTimePosts"
    | "channelPublishingCapabilities"
  > &
  Pick<
    ReturnType<typeof useTelegramPostWorkspaceQueries>,
    "postGroups" | "posts" | "members" | "scheduleTimezone"
  > &
  Pick<ReturnType<typeof useTelegramPostSidebarState>, "postOpenTimerRef"> &
  Pick<
    ReturnType<typeof useTelegramPostEditorState>,
    | "setRememberedPostGroupId"
    | "text"
    | "editing"
    | "error"
    | "mode"
    | "scheduleTime"
    | "scheduleDate"
    | "mediaItems"
    | "busy"
    | "iconPending"
    | "uploadingImages"
    | "title"
  > &
  Pick<
    ReturnType<typeof useTelegramPostPendingState>,
    "savingPostIds" | "creatingPostId"
  >;

export function useTelegramPostEditorContext(input: Input) {
  const {
    workspaceView,
    postView,
    queryClient,
    t,
    pushToast,
    localizedApiError,
    channelId,
    channelTelegramChatId,
    channelTimePosts,
    channelPublishingCapabilities,
    postGroups,
    posts,
    members,
    scheduleTimezone,
    postOpenTimerRef,
    setRememberedPostGroupId,
    text,
    editing,
    error,
    mode,
    scheduleTime,
    scheduleDate,
    mediaItems,
    busy,
    iconPending,
    uploadingImages,
    title,
    savingPostIds,
    creatingPostId,
  } = input;

  useEffect(() => {
    if (workspaceView !== "posts" || postView !== "editor") return;
    void queryClient.invalidateQueries({
      queryKey: ["telegram-managed-post-link-targets", channelId],
    });
  }, [
    channelId,
    postGroups.data,
    postView,
    posts.data,
    queryClient,
    workspaceView,
  ]);

  useEffect(
    () => () => {
      if (postOpenTimerRef.current) {
        window.clearTimeout(postOpenTimerRef.current);
      }
    },
    [],
  );

  const rememberPostGroup = (nextGroupId: string | null) => {
    setRememberedPostGroupId(nextGroupId);
    if (nextGroupId) {
      window.localStorage.setItem(
        postGroupPreferenceKey(channelId),
        nextGroupId,
      );
    } else {
      window.localStorage.removeItem(postGroupPreferenceKey(channelId));
    }
  };

  const currentMemberId =
    members.data?.find((member) => member.isCurrentUser)?.id ?? null;

  const telegramImportedSystemGroup = useMemo(
    () =>
      (postGroups.data || []).find(
        (group) => group.systemKey === "TELEGRAM_IMPORTED",
      ) || null,
    [postGroups.data],
  );

  const postGroupsById = useMemo(
    () => new Map((postGroups.data || []).map((group) => [group.id, group])),
    [postGroups.data],
  );

  const syncedPostGroup = useMemo(
    () =>
      telegramSyncedPostGroup(channelId, t("telegram.posts.support.synced")),
    [channelId, t],
  );

  const effectivePostGroup = (post: TelegramManagedPost) =>
    (post.groupId ? (postGroupsById.get(post.groupId) ?? post.group) : null) ??
    (post.origin === "TELEGRAM" && !post.groupId
      ? (telegramImportedSystemGroup ?? syncedPostGroup)
      : null);

  const effectivePostGroupId = (post: TelegramManagedPost) =>
    effectivePostGroup(post)?.id ?? post.groupId ?? null;

  const effectivePostMember = (post: TelegramManagedPost) =>
    post.assignedMember ?? null;

  const effectivePostMemberId = (post: TelegramManagedPost) =>
    effectivePostMember(post)?.id ?? post.assignedMemberId ?? null;

  const autoPrefilledTitle = useMemo(
    () => extractAutoPrefilledPostTitle(text),
    [text],
  );

  const liveEditingPost =
    editing && posts.data
      ? posts.data.find((post) => post.id === editing.id) || null
      : null;

  const editingMeta = liveEditingPost ?? editing;

  useManagedPostDueRefresh({ channelId, post: editingMeta });

  const isReadOnlyTelegramPost = Boolean(editingMeta?.readOnlyTelegramPost);

  const isPublished = editingMeta?.status === "PUBLISHED";

  const isScheduled = editingMeta?.status === "SCHEDULED";

  const isRemoteTelegramPost =
    editingMeta?.status === "PUBLISHED" || editingMeta?.status === "SCHEDULED";

  const remotePostMediaItems = normalizeTelegramPostMediaItems(
    editingMeta?.mediaItems,
    editingMeta?.imageUrls,
  );

  const hasReplaceableTelegramPhotos =
    isRemoteTelegramPost &&
    remotePostMediaItems.length > 0 &&
    remotePostMediaItems.every((item) => item.kind === "PHOTO");

  const hasNonReplaceableTelegramMedia =
    isRemoteTelegramPost &&
    remotePostMediaItems.length > 0 &&
    !hasReplaceableTelegramPhotos;

  const displayedError = error || editingMeta?.lastError || "";

  const canReturnScheduledPostToDraft = Boolean(
    isScheduled && editingMeta?.origin !== "TELEGRAM",
  );

  const canManageTelegramLink = Boolean(
    editingMeta &&
    (editingMeta.status === "SCHEDULED" ||
      editingMeta.status === "PUBLISHED" ||
      editingMeta.status === "FAILED" ||
      ["BROKEN", "MISSING"].includes(editingMeta.telegramRemoteStatus) ||
      editingMeta.telegramLinkSource === "MANUAL" ||
      editingMeta.telegramMessageUrls.length > 0),
  );

  const telegramLinkBroken = Boolean(
    editingMeta &&
    ["BROKEN", "MISSING"].includes(editingMeta.telegramRemoteStatus),
  );

  const publishedPostNeedsRepublish = Boolean(
    editingMeta?.status === "PUBLISHED" && telegramLinkBroken,
  );

  const effectivePublishingMode: PublishingMode = publishedPostNeedsRepublish
    ? "publish"
    : isScheduled
      ? "schedule"
      : mode;

  const outgoingInternalLinks = useMemo(
    () => buildManagedPostInternalLinks(text, posts.data),
    [posts.data, text],
  );

  const internalLinkTargetIds = useMemo(
    () => outgoingInternalLinks.map((link) => link.targetId),
    [outgoingInternalLinks],
  );

  const incomingInternalLinkPosts = useMemo(() => {
    if (!editing) return [];
    return (posts.data || []).filter((post) => {
      if (post.id === editing.id) return false;
      const linkedIds = [
        ...new Set(
          [
            ...(post.text || "").matchAll(
              /\[[^\]\n]+\]\(tg-post:([a-zA-Z0-9_-]+)\)/g,
            ),
          ].map((match) => match[1]),
        ),
      ];
      return linkedIds.includes(editing.id);
    });
  }, [editing, posts.data]);

  const dependencyPublishBlocked =
    effectivePublishingMode === "publish" &&
    hasBlockingManagedPostInternalLinks(
      outgoingInternalLinks,
      channelTelegramChatId,
    );

  const hasValidScheduleTime = isValidTimeInputValue(scheduleTime);

  const canonicalScheduleTime = canonicalizeTimeInputValue(scheduleTime),
    selectedTimePostId =
      channelTimePosts.find(
        (timePost) => timePost.time === canonicalScheduleTime,
      )?.id || null;

  const internalLinkScheduledAt =
    effectivePublishingMode === "schedule" &&
    scheduleDate &&
    hasValidScheduleTime
      ? zonedDateTimeToUtc(
          scheduleDate,
          scheduleTime,
          scheduleTimezone,
        ).toISOString()
      : undefined;

  const editingIsSaving = Boolean(
    editing && savingPostIds.includes(editing.id),
  );

  const editorIsSaving = editingIsSaving || Boolean(creatingPostId);

  const effectiveCaptionLengthMax =
    channelPublishingCapabilities?.captionLengthMax ?? 1024;

  const effectiveMessageLengthMax =
    channelPublishingCapabilities?.messageLengthMax ??
    TELEGRAM_TEXT_MESSAGE_LIMIT;

  const checkInlineButtonPublishingAccess = async () => {
    try {
      const publishingCapabilities =
        await telegramChannelsApi.checkInlineButtonPublishingAccess(channelId);
      queryClient.setQueryData<TelegramChannel[]>(
        telegramChannelKeys.select({
          canPostMessagesOnly: true,
          includeTest: true,
        }),
        (current) =>
          current?.map((item) =>
            item.id === channelId ? { ...item, publishingCapabilities } : item,
          ),
      );
      if (!publishingCapabilities.canPublishInlineButtons) {
        throw new Error(t("telegramPosts.errors.publishSourceUnavailable"));
      }
      pushToast(t("telegram.posts.editor.botAccessConfirmed"), "success");
      return true;
    } catch (error) {
      pushToast(
        localizedApiError(error, t("telegram.posts.editor.botAccessError")),
        "error",
      );
      return false;
    }
  };

  const hasLongImageText =
    mediaItems.length > 0 && text.length > effectiveCaptionLengthMax;

  const publishedLongImageTextMode: LongTextMode | null =
    isPublished && hasLongImageText
      ? editing?.publishMode === "CAPTION_THEN_TEXT"
        ? "CAPTION_THEN_TEXT"
        : "IMAGES_THEN_TEXT"
      : null;

  const hasLongTextOnly =
    mediaItems.length === 0 && text.length > effectiveMessageLengthMax;

  const publishDisabledReason = busy
    ? t("telegram.posts.editor.validation.busy")
    : isReadOnlyTelegramPost
      ? t("telegram.posts.editor.validation.readOnly")
      : creatingPostId
        ? t("telegram.posts.editor.validation.saving")
        : iconPending
          ? t("telegram.posts.editor.validation.icon")
          : uploadingImages
            ? t("telegram.posts.editor.validation.images")
            : !title.trim()
              ? t("telegram.posts.editor.validation.title")
              : effectivePublishingMode !== "draft" &&
                  !text.trim() &&
                  !mediaItems.length
                ? t("telegram.posts.editor.validation.content")
                : effectivePublishingMode === "schedule" &&
                    (!scheduleDate || !scheduleTime)
                  ? t("telegram.posts.editor.validation.schedule")
                  : effectivePublishingMode === "schedule" &&
                      !hasValidScheduleTime
                    ? t("telegram.posts.editor.validation.time")
                    : "";

  return {
    rememberPostGroup,
    currentMemberId,
    telegramImportedSystemGroup,
    postGroupsById,
    effectivePostGroup,
    effectivePostGroupId,
    effectivePostMember,
    effectivePostMemberId,
    autoPrefilledTitle,
    editingMeta,
    isReadOnlyTelegramPost,
    isPublished,
    isScheduled,
    isRemoteTelegramPost,
    remotePostMediaItems,
    hasReplaceableTelegramPhotos,
    hasNonReplaceableTelegramMedia,
    canReturnScheduledPostToDraft,
    canManageTelegramLink,
    telegramLinkBroken,
    publishedPostNeedsRepublish,
    effectivePublishingMode,
    outgoingInternalLinks,
    incomingInternalLinkPosts,
    dependencyPublishBlocked,
    internalLinkScheduledAt,
    editorIsSaving,
    effectiveCaptionLengthMax,
    effectiveMessageLengthMax,
    checkInlineButtonPublishingAccess,
    hasLongImageText,
    publishedLongImageTextMode,
    hasLongTextOnly,
    publishDisabledReason,
  };
}
