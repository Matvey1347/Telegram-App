"use client";

import { type TelegramManagedPost, telegramChannelsApi } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import type { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import type { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import type { useTelegramPostSelection } from "./use-telegram-post-selection";

type Input = Pick<
  ReturnType<typeof useTelegramWorkspaceView>,
  | "pushToast"
  | "t"
  | "setProgress"
  | "locale"
  | "clearProgress"
  | "queryClient"
  | "localizedApiError"
> &
  Pick<
    TelegramPostWorkspaceProps,
    "channelId" | "channelPhotoUrl" | "onPostSelect"
  > &
  Pick<
    ReturnType<typeof useTelegramPostEditorState>,
    "editing" | "setSelectedPostIds"
  > &
  Pick<ReturnType<typeof useTelegramPostSelection>, "reset">;

export function createTelegramPostDeletion(input: Input) {
  const {
    pushToast,
    t,
    setProgress,
    locale,
    clearProgress,
    queryClient,
    localizedApiError,
    channelId,
    channelPhotoUrl,
    onPostSelect,
    editing,
    setSelectedPostIds,
    reset,
  } = input;

  const deletePosts = async (targetPosts: TelegramManagedPost[]) => {
    if (targetPosts.some((post) => post.readOnlyTelegramPost)) {
      pushToast(t("telegram.posts.editor.readOnlyDelete"), "info");
      return;
    }
    const progressId = `managed-post-delete:${channelId}`;
    try {
      setProgress({
        id: progressId,
        title: t("telegram.posts.editor.deletePosts"),
        current: 0,
        total: targetPosts.length,
        message: t("telegram.posts.editor.deleting"),
        iconUrl: channelPhotoUrl || undefined,
      });
      const result = await telegramChannelsApi.deleteManagedPosts(
        channelId,
        targetPosts.map((post) => post.id),
        (item, current, total) => {
          setProgress({
            id: progressId,
            title: t("telegram.posts.editor.deletePosts"),
            current,
            total,
            message:
              (locale === "en" ? item.message : null) ||
              t("telegram.posts.editor.deleting"),
            iconUrl: channelPhotoUrl || undefined,
          });
        },
      );
      setProgress({
        id: progressId,
        title: t("telegram.posts.editor.deletePosts"),
        current: result.total,
        total: result.total,
        message: t("telegram.posts.editor.deleteResult", {
          deleted: result.successCount,
          failed: result.failedCount,
          skipped: result.skippedCount,
        }),
        completed: true,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        iconUrl: channelPhotoUrl || undefined,
      });
      window.setTimeout(() => clearProgress(progressId), 2800);
      const deletedPostIds = new Set(
        result.results
          .filter((item) => item.success)
          .map((item) => item.postId),
      );
      if (editing?.id && deletedPostIds.has(editing.id)) {
        reset();
        onPostSelect(null);
      }
      setSelectedPostIds((current) =>
        current.filter((id) => !deletedPostIds.has(id)),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramPostKeys.managedLists(channelId),
        }),
        queryClient.invalidateQueries({ queryKey: ["post-groups", channelId] }),
      ]);
      pushToast(
        result.failedCount
          ? t("telegram.posts.editor.deleteResultShort", {
              successful: result.successCount,
              failed: result.failedCount,
            })
          : targetPosts.length === 1
            ? t("telegram.posts.editor.deleted", {
                title: targetPosts[0].title,
              })
            : t("telegram.posts.editor.deletedCount", {
                count: result.successCount,
              }),
        result.failedCount ? "info" : "success",
      );
    } catch (error) {
      clearProgress(progressId);
      pushToast(
        localizedApiError(error, t("telegram.posts.editor.deleteError")),
        "error",
        7000,
      );
    }
  };

  return { deletePosts };
}
