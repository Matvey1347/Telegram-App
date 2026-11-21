"use client";

import { wantsNewTab } from "../managed-post-identity";

import { useEffect, useMemo } from "react";
import {
  type TelegramManagedPost,
  type TelegramManagedPostRevision,
  telegramChannelsApi,
  type TelegramChannelTimePost,
} from "@/lib/api";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
import { useMutation } from "@tanstack/react-query";
import { telegramPostKeys } from "@/lib/query-keys";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import {
  localNowParts,
  localDateTimeParts,
  scheduleDateForPreset,
  POST_OPEN_CLICK_DELAY_MS,
} from "./telegram-post-workspace-model";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramPostSidebarList } from "./use-telegram-post-sidebar-list";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { useTelegramPostPendingState } from "./use-telegram-post-pending-state";
import type { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";
import type { useTelegramPostSidebarState } from "./use-telegram-post-sidebar-state";
import type { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";

type Input = Pick<
  TelegramPostWorkspaceProps,
  "workspaceTimezone" | "newPostToken" | "channelId" | "onPostSelect"
> &
  Pick<
    ReturnType<typeof useTelegramPostEditorState>,
    | "rememberedPostGroupId"
    | "setEditing"
    | "setTitle"
    | "setTitleManuallyEdited"
    | "setAssignedMemberId"
    | "setMemberSelectionTouched"
    | "setText"
    | "setMediaItems"
    | "setButtonRows"
    | "setIcon"
    | "iconRef"
    | "iconAutofillRef"
    | "setIconPending"
    | "setIconPickerGeneration"
    | "setPostGroupId"
    | "setNewPostHypothesisIds"
    | "setMode"
    | "setScheduleDate"
    | "setScheduleTime"
    | "setPublicationSlotId"
    | "setDeleteAfterHours"
    | "setLongTextMode"
    | "setUploadingImages"
    | "setSelectedPostIds"
    | "setError"
    | "editing"
    | "memberSelectionTouched"
    | "assignedMemberId"
  > &
  Pick<
    ReturnType<typeof useTelegramPostSidebarList>,
    | "changeWorkspaceView"
    | "changeStatusTab"
    | "allChannelPostsSelected"
    | "channelPostIds"
    | "allTabPostsSelected"
    | "tabPostIds"
  > &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    | "restoredPostIdRef"
    | "t"
    | "queryClient"
    | "pushToast"
    | "localizedApiError"
  > &
  Pick<
    ReturnType<typeof useTelegramPostPendingState>,
    | "setCreatingPostId"
    | "creatingPostIdRef"
    | "setRestorePreviewRevision"
    | "setRestoreConfirmationValue"
    | "restorePreviewRevision"
    | "restoreConfirmationValue"
  > &
  Pick<
    ReturnType<typeof useTelegramPostEditorContext>,
    | "currentMemberId"
    | "effectivePostMemberId"
    | "effectivePostGroupId"
    | "rememberPostGroup"
  > &
  Pick<
    ReturnType<typeof useTelegramPostSidebarState>,
    | "setHistoryOpen"
    | "setHighlightedInternalLinkTargetId"
    | "setHighlightRequestKey"
    | "postOpenTimerRef"
  > &
  Pick<
    ReturnType<typeof useTelegramPostWorkspaceQueries>,
    "authoritativeEditingPost" | "scheduleTimezone"
  >;

export function useTelegramPostSelection(input: Input) {
  const {
    workspaceTimezone,
    newPostToken,
    channelId,
    onPostSelect,
    rememberedPostGroupId,
    setEditing,
    setTitle,
    setTitleManuallyEdited,
    setAssignedMemberId,
    setMemberSelectionTouched,
    setText,
    setMediaItems,
    setButtonRows,
    setIcon,
    iconRef,
    iconAutofillRef,
    setIconPending,
    setIconPickerGeneration,
    setPostGroupId,
    setNewPostHypothesisIds,
    setMode,
    setScheduleDate,
    setScheduleTime,
    setPublicationSlotId,
    setDeleteAfterHours,
    setLongTextMode,
    setUploadingImages,
    setSelectedPostIds,
    setError,
    editing,
    memberSelectionTouched,
    assignedMemberId,
    changeWorkspaceView,
    changeStatusTab,
    allChannelPostsSelected,
    channelPostIds,
    allTabPostsSelected,
    tabPostIds,
    restoredPostIdRef,
    t,
    queryClient,
    pushToast,
    localizedApiError,
    setCreatingPostId,
    creatingPostIdRef,
    setRestorePreviewRevision,
    setRestoreConfirmationValue,
    restorePreviewRevision,
    restoreConfirmationValue,
    currentMemberId,
    effectivePostMemberId,
    effectivePostGroupId,
    rememberPostGroup,
    setHistoryOpen,
    setHighlightedInternalLinkTargetId,
    setHighlightRequestKey,
    postOpenTimerRef,
    authoritativeEditingPost,
    scheduleTimezone,
  } = input;

  const reset = () => {
    const now = localNowParts(workspaceTimezone);
    const nextGroupId = rememberedPostGroupId;
    changeWorkspaceView("posts");
    restoredPostIdRef.current = "";
    setEditing(null);
    setTitle("");
    setTitleManuallyEdited(false);
    setAssignedMemberId(null);
    setMemberSelectionTouched(false);
    setText("");
    setMediaItems([]);
    setButtonRows([]);
    setIcon(null);
    iconRef.current = null;
    iconAutofillRef.current = { active: false, emoji: null };
    setIconPending(false);
    setIconPickerGeneration((current) => current + 1);
    setPostGroupId(nextGroupId);
    setNewPostHypothesisIds([]);
    setMode("draft");
    setScheduleDate(now.date);
    setScheduleTime(now.time);
    setPublicationSlotId(null);
    setDeleteAfterHours(null);
    setLongTextMode("IMAGES_THEN_TEXT");
    setUploadingImages(false);
    setSelectedPostIds([]);
    setCreatingPostId(null);
    creatingPostIdRef.current = null;
    setError("");
  };

  useEffect(() => {
    // Header action intentionally resets the editor state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newPostToken > 0) reset();
    // reset intentionally captures the latest remembered group only when the action fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPostToken]);

  useEffect(() => {
    if (
      editing ||
      memberSelectionTouched ||
      assignedMemberId ||
      !currentMemberId
    ) {
      return;
    }
    // Async member data supplies the initial form default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignedMemberId(currentMemberId);
  }, [assignedMemberId, currentMemberId, editing, memberSelectionTouched]);

  const selectPost = (post: TelegramManagedPost) => {
    // A newly created post may still be saving in the background. Once the
    // user opens another post, its editor must not inherit that save overlay.
    setCreatingPostId(null);
    setHistoryOpen(false);
    creatingPostIdRef.current = null;
    restoredPostIdRef.current = post.id;
    setEditing(post);
    setTitle(post.title);
    setTitleManuallyEdited(true);
    setAssignedMemberId(effectivePostMemberId(post));
    setMemberSelectionTouched(false);
    setText(post.text || "");
    setMediaItems(
      normalizeTelegramPostMediaItems(post.mediaItems, post.imageUrls),
    );
    setButtonRows(post.buttonRows ?? []);
    setIcon(post.icon ?? null);
    iconRef.current = post.icon ?? null;
    iconAutofillRef.current = { active: false, emoji: null };
    setIconPending(false);
    const nextGroupId = effectivePostGroupId(post);
    setPostGroupId(nextGroupId);
    setNewPostHypothesisIds([]);
    rememberPostGroup(nextGroupId);
    setMode(post.status === "SCHEDULED" ? "schedule" : "draft");
    const scheduledLocalParts = post.scheduledAt
      ? localDateTimeParts(
          post.scheduledAt,
          post.scheduleTimezone ?? workspaceTimezone,
        )
      : null;
    setScheduleDate(
      scheduledLocalParts?.date ||
        localNowParts(post.scheduleTimezone ?? workspaceTimezone).date,
    );
    const postScheduleTime =
      scheduledLocalParts?.time ||
      localNowParts(post.scheduleTimezone ?? workspaceTimezone).time;
    setScheduleTime(postScheduleTime);
    setPublicationSlotId(post.publicationSlotId ?? null);
    setDeleteAfterHours(post.deleteAfterHours ?? null);
    setUploadingImages(false);
    if (
      post.publishMode === "IMAGES_THEN_TEXT" ||
      post.publishMode === "CAPTION_THEN_TEXT"
    ) {
      setLongTextMode(post.publishMode);
    } else {
      setLongTextMode("IMAGES_THEN_TEXT");
    }
    setError("");
  };

  useEffect(() => {
    if (
      !editing ||
      !authoritativeEditingPost?.scheduledAt ||
      authoritativeEditingPost.status !== "SCHEDULED"
    ) {
      return;
    }
    const local = localDateTimeParts(
      authoritativeEditingPost.scheduledAt,
      scheduleTimezone,
    );
    setScheduleDate((current) =>
      current === local.date ? current : local.date,
    );
    setScheduleTime((current) =>
      current === local.time ? current : local.time,
    );
  }, [
    authoritativeEditingPost?.id,
    authoritativeEditingPost?.scheduledAt,
    authoritativeEditingPost?.scheduleTimezone,
    authoritativeEditingPost?.status,
    editing,
    scheduleTimezone,
  ]);

  const restorePostRevision = useMutation({
    mutationFn: async (revision: TelegramManagedPostRevision) => {
      if (!editing) throw new Error(t("telegram.posts.editor.error.noPost"));
      if (editing.readOnlyTelegramPost)
        throw new Error("Synced Telegram posts are read-only");
      return telegramChannelsApi.restoreManagedPostHistory(
        channelId,
        editing.id,
        revision.id,
      );
    },
    onSuccess: async (post) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-history", channelId, post.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-link-targets", channelId],
        }),
      ]);
      selectPost(post);
      setRestorePreviewRevision(null);
      setRestoreConfirmationValue("");
      pushToast(
        t("telegram.posts.editor.restored", { title: post.title }),
        "success",
      );
    },
    onError: (mutationError) => {
      pushToast(
        localizedApiError(
          mutationError,
          t("telegram.posts.editor.restoreError"),
        ),
        "error",
        7000,
      );
    },
  });

  const restoreConfirmationValid = useMemo(
    () =>
      Boolean(
        editing &&
        restorePreviewRevision &&
        restoreConfirmationValue.trim() === editing.title,
      ),
    [editing, restoreConfirmationValue, restorePreviewRevision],
  );

  const returnManagedPostToDraft = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error(t("telegram.posts.editor.error.noPost"));
      if (editing.readOnlyTelegramPost)
        throw new Error("Synced Telegram posts are read-only");
      return telegramChannelsApi.returnManagedPostToDraft(
        channelId,
        editing.id,
      );
    },
    onSuccess: async (post) => {
      changeStatusTab("DRAFT");
      selectPost(post);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts-calendar", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-history", channelId, post.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-link-targets", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["post-groups", channelId],
        }),
      ]);
      pushToast(
        t("telegram.posts.editor.returnedToDraft", { title: post.title }),
        "success",
      );
    },
    onError: (mutationError) => {
      pushToast(
        localizedApiError(
          mutationError,
          t("telegram.posts.editor.returnDraftError"),
        ),
        "error",
        7000,
      );
    },
  });

  const toggleAllChannelPosts = () => {
    setSelectedPostIds((current) => {
      if (allChannelPostsSelected) {
        return current.filter((id) => !channelPostIds.includes(id));
      }
      return [...new Set([...current, ...channelPostIds])];
    });
  };

  const toggleAllTabPosts = () => {
    setSelectedPostIds((current) => {
      if (allTabPostsSelected) {
        return current.filter((id) => !tabPostIds.includes(id));
      }
      return [...new Set([...current, ...tabPostIds])];
    });
  };

  const togglePostSelected = (postId: string) => {
    setSelectedPostIds((current) =>
      current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId],
    );
  };

  const openPost = (post: TelegramManagedPost) => {
    selectPost(post);
    onPostSelect(post.id);
  };

  const openPostInNewTab = (post: { id: string }) => {
    window.open(
      buildTelegramPostsUrl({
        channelId,
        postId: post.id,
        postView: "editor",
      }),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const openPostWithModifier = (
    post: TelegramManagedPost,
    event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
  ) => {
    if (wantsNewTab(event)) {
      openPostInNewTab(post);
      return;
    }
    openPost(post);
  };

  const highlightInternalLinkTarget = (targetId: string) => {
    setHighlightedInternalLinkTargetId(targetId);
    setHighlightRequestKey((current) => current + 1);
  };

  const applyChannelTimePost = (timePost: TelegramChannelTimePost) => {
    setScheduleDate(
      (current) =>
        current || scheduleDateForPreset(timePost.time, workspaceTimezone),
    );
    setScheduleTime(timePost.time);
  };

  const cancelScheduledPostOpen = () => {
    if (postOpenTimerRef.current) {
      window.clearTimeout(postOpenTimerRef.current);
      postOpenTimerRef.current = null;
    }
  };

  const schedulePostOpen = (post: TelegramManagedPost) => {
    cancelScheduledPostOpen();
    postOpenTimerRef.current = window.setTimeout(() => {
      postOpenTimerRef.current = null;
      openPost(post);
    }, POST_OPEN_CLICK_DELAY_MS);
  };

  const changePostIcon = (nextIcon: string | null) => {
    iconRef.current = nextIcon;
    iconAutofillRef.current = { active: false, emoji: null };
    setIcon(nextIcon);
    setIconPending(false);
  };

  return {
    reset,
    selectPost,
    restorePostRevision,
    restoreConfirmationValid,
    returnManagedPostToDraft,
    toggleAllChannelPosts,
    toggleAllTabPosts,
    togglePostSelected,
    openPost,
    openPostInNewTab,
    openPostWithModifier,
    highlightInternalLinkTarget,
    cancelScheduledPostOpen,
    schedulePostOpen,
    changePostIcon,
  };
}
