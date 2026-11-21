"use client";

import { hasInvalidTelegramInlineButtons } from "@/lib/features/telegram/telegram-inline-buttons";
import { isValidTimeInputValue } from "@/components/ui/primitives";
import { zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import {
  type TelegramPostMediaItem,
  type TelegramPostButtonRows,
} from "@telegram-system/shared";
import {
  telegramChannelsApi,
  type PostGroup,
  telegramContentHypothesesApi,
} from "@/lib/api";
import {
  telegramPostKeys,
  telegramContentHypothesisKeys,
} from "@/lib/query-keys";
import {
  managedPostScheduleUnchanged,
  managedPostScheduleUi,
} from "@/components/features/telegram/telegram/managed-post-presentation";
import {
  reconcileManagedPost,
  invalidateManagedPostScheduleReads,
} from "@/components/features/telegram/telegram/managed-post-cache";
import { type PostStatusTab } from "./telegram-post-workspace-model";
import type { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";
import type { useTelegramPostPendingState } from "./use-telegram-post-pending-state";
import type { useTelegramPostSidebarList } from "./use-telegram-post-sidebar-list";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramPostSelection } from "./use-telegram-post-selection";

type Input = Pick<
  ReturnType<typeof useTelegramPostEditorContext>,
  | "isReadOnlyTelegramPost"
  | "effectivePublishingMode"
  | "currentMemberId"
  | "editingMeta"
  | "telegramLinkBroken"
> &
  Pick<
    ReturnType<typeof useTelegramPostEditorState>,
    | "setError"
    | "editing"
    | "title"
    | "postGroupId"
    | "newPostHypothesisIds"
    | "iconRef"
    | "longTextMode"
    | "buttonRows"
    | "scheduleTime"
    | "scheduleDate"
    | "text"
    | "imageUrls"
    | "mediaItems"
    | "deleteAfterHours"
    | "assignedMemberId"
    | "memberSelectionTouched"
    | "publicationSlotId"
    | "setEditing"
  > &
  Pick<
    ReturnType<typeof useTelegramWorkspaceView>,
    "t" | "queryClient" | "pushToast" | "localizedApiError"
  > &
  Pick<ReturnType<typeof useTelegramPostWorkspaceQueries>, "scheduleTimezone"> &
  Pick<
    ReturnType<typeof useTelegramPostPendingState>,
    | "setSavingPostIds"
    | "setCreatingPostId"
    | "creatingPostIdRef"
    | "setPendingPostSaves"
  > &
  Pick<ReturnType<typeof useTelegramPostSidebarList>, "changeStatusTab"> &
  Pick<
    TelegramPostWorkspaceProps,
    "channelPublishingCapabilities" | "channelId" | "onPostSelect"
  > &
  Pick<ReturnType<typeof useTelegramPostSelection>, "selectPost">;

export function createTelegramPostPublication(input: Input) {
  const {
    isReadOnlyTelegramPost,
    effectivePublishingMode,
    currentMemberId,
    editingMeta,
    telegramLinkBroken,
    setError,
    editing,
    title,
    postGroupId,
    newPostHypothesisIds,
    iconRef,
    longTextMode,
    buttonRows,
    scheduleTime,
    scheduleDate,
    text,
    imageUrls,
    mediaItems,
    deleteAfterHours,
    assignedMemberId,
    memberSelectionTouched,
    publicationSlotId,
    setEditing,
    t,
    queryClient,
    pushToast,
    localizedApiError,
    scheduleTimezone,
    setSavingPostIds,
    setCreatingPostId,
    creatingPostIdRef,
    setPendingPostSaves,
    changeStatusTab,
    channelPublishingCapabilities,
    channelId,
    onPostSelect,
    selectPost,
  } = input;

  const run = () => {
    if (isReadOnlyTelegramPost) return;
    setError("");
    const editingPost = editing;
    const saveMode = effectivePublishingMode;
    const saveTitle = title.trim();
    const saveGroupId = postGroupId;
    const saveHypothesisIds = newPostHypothesisIds;
    const saveIcon = iconRef.current;
    const saveLongTextMode = longTextMode;
    if (hasInvalidTelegramInlineButtons(buttonRows)) {
      setError(t("telegram.posts.editor.error.inlineButtonUrl"));
      return;
    }
    if (saveMode === "schedule" && !isValidTimeInputValue(scheduleTime)) {
      setError(t("telegram.posts.editor.invalidPublishTime"));
      return;
    }
    const saveScheduledAt =
      saveMode === "schedule"
        ? zonedDateTimeToUtc(
            scheduleDate,
            scheduleTime,
            scheduleTimezone,
          ).toISOString()
        : null;
    const payload: {
      title: string;
      text: string;
      imageUrls: string[];
      mediaItems: TelegramPostMediaItem[];
      buttonRows: TelegramPostButtonRows;
      assignedMemberId?: string;
      icon?: string | null;
      deleteAfterHours?: number | null;
    } = {
      title: saveTitle,
      text,
      imageUrls: [...imageUrls],
      mediaItems: [...mediaItems],
      buttonRows,
      icon: saveIcon,
      deleteAfterHours,
    };
    const selectedMemberId =
      assignedMemberId ??
      (!editingPost && !memberSelectionTouched ? currentMemberId : null);
    if (selectedMemberId && (!editingPost || memberSelectionTouched)) {
      payload.assignedMemberId = selectedMemberId;
    }
    const isPublishedEdit = editingMeta?.status === "PUBLISHED";
    const shouldRepublishPublished =
      editingMeta?.status === "PUBLISHED" && telegramLinkBroken;
    const pendingId =
      editingPost?.id ||
      `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nextStatusTab: PostStatusTab = editingPost
      ? editingPost.status === "PUBLISHED"
        ? "PUBLISHED"
        : editingPost.status === "SCHEDULED"
          ? "SCHEDULED"
          : saveMode === "schedule"
            ? "SCHEDULED"
            : saveMode === "publish"
              ? "PUBLISHED"
              : "DRAFT"
      : saveMode === "schedule"
        ? "SCHEDULED"
        : saveMode === "publish"
          ? "PUBLISHED"
          : "DRAFT";
    if (editingPost) {
      setSavingPostIds((current) => [...new Set([...current, pendingId])]);
    } else {
      setCreatingPostId(pendingId);
      creatingPostIdRef.current = pendingId;
      setPendingPostSaves((current) => [
        {
          id: pendingId,
          title: saveTitle,
          icon: saveIcon,
          groupId: saveGroupId,
          mode: saveMode,
        },
        ...current,
      ]);
    }
    changeStatusTab(nextStatusTab);
    void (async () => {
      let persisted = false;
      try {
        if (saveMode === "publish" || saveMode === "schedule") {
          if (!channelPublishingCapabilities?.source) {
            throw new Error(t("telegram.posts.editor.error.publishingSource"));
          }
          if (
            buttonRows.length &&
            !channelPublishingCapabilities.canPublishInlineButtons
          ) {
            throw new Error(
              t("telegram.posts.editor.error.inlineButtonsPermission"),
            );
          }
        }
        let post = editingPost
          ? await telegramChannelsApi.updateManagedPost(
              channelId,
              editingPost.id,
              payload,
              true,
            )
          : await telegramChannelsApi.createManagedPost(
              channelId,
              payload,
              true,
            );
        persisted = true;
        if (saveGroupId && saveGroupId !== (editingPost?.groupId ?? null)) {
          const group = await telegramChannelsApi.addPostsToGroup(
            saveGroupId,
            [post.id],
            true,
          );
          queryClient.setQueryData<PostGroup[]>(
            telegramPostKeys.postGroups(channelId),
            (current) =>
              current?.map((item) => (item.id === group.id ? group : item)),
          );
          post = { ...post, groupId: group.id, group };
        } else if (editingPost?.groupId && !saveGroupId) {
          const group = await telegramChannelsApi.removePostFromGroup(
            editingPost.groupId,
            post.id,
            true,
          );
          queryClient.setQueryData<PostGroup[]>(
            telegramPostKeys.postGroups(channelId),
            (current) =>
              current?.map((item) => (item.id === group.id ? group : item)),
          );
          post = { ...post, groupId: null, group: null };
        }
        if (!editingPost && saveHypothesisIds.length) {
          await telegramContentHypothesesApi.assignToPost(channelId, post.id, {
            hypothesisIds: saveHypothesisIds,
          });
          await queryClient.invalidateQueries({
            queryKey: telegramContentHypothesisKeys.list(channelId),
          });
        }
        if (shouldRepublishPublished) {
          post = await telegramChannelsApi.publishManagedPost(
            channelId,
            post.id,
            saveLongTextMode,
            true,
          );
        } else if (isPublishedEdit) {
          // Published posts are updated in place by PATCH.
          // Never run the publish endpoint again after a Telegram text edit.
        } else if (saveMode === "publish") {
          post = await telegramChannelsApi.publishManagedPost(
            channelId,
            post.id,
            saveLongTextMode,
            true,
          );
        } else if (
          saveMode === "schedule" &&
          saveScheduledAt &&
          !managedPostScheduleUnchanged(editingPost, saveScheduledAt)
        ) {
          post = await telegramChannelsApi.scheduleManagedPost(
            channelId,
            post.id,
            saveScheduledAt,
            saveLongTextMode,
            true,
            publicationSlotId ?? undefined,
          );
        }
        reconcileManagedPost(queryClient, channelId, post);
        if (!editingPost) {
          await queryClient.invalidateQueries({
            queryKey: telegramPostKeys.managedLists(channelId),
          });
        }
        if (editingPost) {
          setEditing((current) => (current?.id === post.id ? post : current));
        } else if (creatingPostIdRef.current === pendingId) {
          selectPost(post);
          onPostSelect(post.id);
        }
        await Promise.all([
          invalidateManagedPostScheduleReads(queryClient, channelId),
          queryClient.invalidateQueries({
            queryKey: telegramPostKeys.linkTargets(channelId),
          }),
        ]);
        const savedIcon = post.iconPresentation ?? null;
        const toastIcon = savedIcon
          ? {
              emoji: savedIcon.type === "unicode" ? savedIcon.value : null,
              imageUrl: savedIcon.type === "image" ? savedIcon.url : null,
            }
          : undefined;
        pushToast(
          shouldRepublishPublished
            ? t("telegram.posts.editor.publishedAgain", { title: saveTitle })
            : editingMeta?.status === "PUBLISHED"
              ? t("telegram.posts.editor.updatedTelegram", { title: saveTitle })
              : saveMode === "publish"
                ? t("telegram.posts.editor.publishedNamed", {
                    title: saveTitle,
                  })
                : saveMode === "schedule"
                  ? managedPostScheduleUi({
                      title: saveTitle,
                      scheduleMode: post.scheduleMode,
                      t,
                    }).message
                  : t("telegram.posts.editor.savedNamed", { title: saveTitle }),
          "success",
          post.scheduleMode === "LOCAL" ? 7000 : 3500,
          toastIcon,
        );
      } catch (runError) {
        const message = localizedApiError(
          runError,
          t("telegram.posts.editor.saveError", { title: saveTitle }),
        );
        setError(message);
        pushToast(message, "error", 7000);
        if (persisted) {
          void Promise.allSettled([
            queryClient.invalidateQueries({
              queryKey: telegramPostKeys.managedLists(channelId),
            }),
            invalidateManagedPostScheduleReads(queryClient, channelId),
            queryClient.invalidateQueries({
              queryKey: telegramPostKeys.linkTargets(channelId),
            }),
          ]);
        }
      } finally {
        setPendingPostSaves((current) =>
          current.filter((item) => item.id !== pendingId),
        );
        setCreatingPostId((current) =>
          current === pendingId ? null : current,
        );
        if (creatingPostIdRef.current === pendingId) {
          creatingPostIdRef.current = null;
        }
        setSavingPostIds((current) => current.filter((id) => id !== pendingId));
      }
    })();
  };

  return { run };
}
