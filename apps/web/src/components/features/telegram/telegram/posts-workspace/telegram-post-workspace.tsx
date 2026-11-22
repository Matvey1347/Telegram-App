"use client";

import {
  TelegramPostsPageTabHead,
  TelegramPostsViewNavigation,
} from "@/components/features/telegram/telegram/telegram-posts-workspace-navigation";
import {
  ConfirmDeleteModal,
  Modal,
  Input,
  Button,
} from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { workspaceKeys, telegramPostKeys } from "@/lib/query-keys";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
import { formatDateTime } from "@/lib/date-format";
import {
  TelegramCustomEmojiPacksModal,
  AiPostingPage,
  TelegramPostPreview,
} from "./telegram-post-workspace-lazy-views";
import { MovePostModal } from "../managed-post-move-modal";
import { Plus } from "lucide-react";
import { formatManagedPostRevisionReason } from "./telegram-post-workspace-model";
import { useTelegramPostWorkspace } from "./use-telegram-post-workspace";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import { TelegramCalendarImportModal } from "./telegram-calendar-import-modal";
import { TelegramPostCalendar } from "./telegram-post-calendar";
import { TelegramManagedPostEditor } from "./telegram-managed-post-editor";

export function TelegramPostWorkspace(props: TelegramPostWorkspaceProps) {
  const model = useTelegramPostWorkspace(props);
  const {
    postView,
    channelTitle,
    channelPhotoUrl,
    t,
    onRequestNewPost,
    onPostSelect,
    changePostView,
    deletingPlannerFormat,
    setDeletingPlannerFormat,
    runPlannerMutation,
    channelId,
    customEmojiPacksOpen,
    setCustomEmojiPacksOpen,
    customEmojiPacks,
    queryClient,
    deletingPlannerSlotGroup,
    setDeletingPlannerSlotGroup,
    channels,
    deletingPost,
    setDeletingPost,
    deletePosts,
    movingPost,
    setMovingPost,
    pushToast,
    editing,
    reset,
    restorePreviewRevision,
    restorePostRevision,
    setRestorePreviewRevision,
    setRestoreConfirmationValue,
    effectiveCaptionLengthMax,
    effectiveMessageLengthMax,
    locale,
    restoreConfirmationValue,
    restoreConfirmationValid,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    selectedPosts,
  } = model;

  return (
    <>
      <TelegramPostsPageTabHead
        postView={postView}
        channelTitle={channelTitle}
        channelPhotoUrl={channelPhotoUrl}
        labels={{
          calendar: t("telegram.posts.tabs.calendar"),
          editor: t("telegram.posts.tabs.editor"),
        }}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TelegramPostsViewNavigation
          view={postView}
          onViewChange={changePostView}
          labels={{
            editor: t("telegram.posts.tabs.editor"),
            calendar: t("telegram.posts.tabs.calendar"),
            "ai-posting": "AI Posting",
          }}
        />
        {postView !== "ai-posting" ? (
          <Button type="button" className="ml-auto" onClick={onRequestNewPost}>
            <Plus size={16} /> {t("telegram.posts.newPost")}
          </Button>
        ) : null}
      </div>
      <TelegramCalendarImportModal model={model} />
      <ConfirmDeleteModal
        open={Boolean(deletingPlannerFormat)}
        onClose={() => setDeletingPlannerFormat(null)}
        entityName={deletingPlannerFormat?.name || ""}
        label={t("telegram.posts.calendar.deleteFormat")}
        description={t("telegram.posts.calendar.deleteFormatDescription")}
        onConfirm={async () => {
          if (!deletingPlannerFormat) return;
          await runPlannerMutation(
            () =>
              telegramChannelsApi.deletePostPlannerFormat(
                channelId,
                deletingPlannerFormat.id,
              ),
            t("telegram.posts.calendar.formatDeleted"),
          );
          setDeletingPlannerFormat(null);
        }}
      />
      {customEmojiPacksOpen ? (
        <TelegramCustomEmojiPacksModal
          open
          onClose={() => setCustomEmojiPacksOpen(false)}
          packs={customEmojiPacks.data?.packs || []}
          onImport={async (input) => {
            const response =
              await telegramChannelsApi.importCustomEmojiPack(input);
            queryClient.setQueryData(
              workspaceKeys.telegramCustomEmojiPacks(),
              response,
            );
          }}
          onDetach={async (packId) => {
            const response =
              await telegramChannelsApi.detachCustomEmojiPack(packId);
            queryClient.setQueryData(
              workspaceKeys.telegramCustomEmojiPacks(),
              response,
            );
          }}
          onRefresh={async (packId) => {
            const response =
              await telegramChannelsApi.refreshCustomEmojiPack(packId);
            queryClient.setQueryData(
              workspaceKeys.telegramCustomEmojiPacks(),
              response,
            );
          }}
        />
      ) : null}
      <ConfirmDeleteModal
        open={Boolean(deletingPlannerSlotGroup)}
        onClose={() => setDeletingPlannerSlotGroup(null)}
        entityName={
          deletingPlannerSlotGroup
            ? t("telegram.posts.calendar.publishingTimes", {
                count: deletingPlannerSlotGroup.timePostIds.length,
              })
            : ""
        }
        label={t("telegram.posts.calendar.deleteSlot")}
        description={t("telegram.posts.calendar.deleteSlotDescription")}
        onConfirm={async () => {
          if (!deletingPlannerSlotGroup) return;
          await runPlannerMutation(
            () =>
              telegramChannelsApi.mutatePostPlannerSlotsWithProgress(
                channelId,
                deletingPlannerSlotGroup.slots.map((slot) => ({
                  action: "DELETE" as const,
                  slotId: slot.id,
                })),
                () => undefined,
              ),
            deletingPlannerSlotGroup.slots.length === 1
              ? t("telegram.posts.calendar.slotDeleted")
              : t("telegram.posts.calendar.slotsDeleted", {
                  count: deletingPlannerSlotGroup.slots.length,
                }),
          );
          setDeletingPlannerSlotGroup(null);
        }}
      />
      {postView === "ai-posting" ? (
        <AiPostingPage channelId={channelId} channelTitle={channelTitle} />
      ) : postView === "calendar" ? (
        <TelegramPostCalendar model={model} />
      ) : (
        <TelegramManagedPostEditor model={model} />
      )}

      <ConfirmDeleteModal
        open={!!deletingPost}
        onClose={() => setDeletingPost(null)}
        entityName={deletingPost?.title || ""}
        label={t("telegram.posts.editor.deletePost")}
        description={
          deletingPost?.status === "SCHEDULED"
            ? t("telegram.posts.editor.deleteScheduledDescription")
            : t("telegram.posts.editor.deleteDescription")
        }
        onConfirm={() => {
          if (!deletingPost) return;
          const postToDelete = deletingPost;
          setDeletingPost(null);
          void deletePosts([postToDelete]);
        }}
      />
      {movingPost ? (
        <MovePostModal
          post={movingPost}
          channels={channels}
          sourceChannelId={channelId}
          onClose={() => setMovingPost(null)}
          onMoved={async (result, targetId) => {
            setMovingPost(null);
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managedLists(channelId),
              }),
              queryClient.invalidateQueries({ queryKey: telegramPostKeys.managedLists(targetId) }),
              queryClient.invalidateQueries({
                queryKey: ["post-groups", channelId],
              }),
            ]);
            pushToast(
              t("telegram.posts.bulk.completed", {
                success: result.successCount,
                failed: result.failedCount,
                skipped: result.skippedCount,
              }),
              result.failedCount ? "error" : "success",
              7000,
            );
            if (result.successCount && editing?.id === movingPost.id) {
              reset();
              onPostSelect(null);
            }
          }}
        />
      ) : null}
      {editing && restorePreviewRevision ? (
        <Modal
          open
          onClose={() => {
            if (restorePostRevision.isPending) return;
            setRestorePreviewRevision(null);
            setRestoreConfirmationValue("");
          }}
          title={t("telegram.posts.editor.restoreBackup")}
          size="xl"
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_360px]">
            <TelegramPostPreview
              channelTitle={channelTitle}
              channelPhotoUrl={channelPhotoUrl}
              text={restorePreviewRevision.text || ""}
              imageUrls={restorePreviewRevision.imageUrls}
              mediaItems={normalizeTelegramPostMediaItems(
                restorePreviewRevision.mediaItems,
                restorePreviewRevision.imageUrls,
              )}
              buttonRows={restorePreviewRevision.buttonRows ?? []}
              captionLengthMax={
                restorePreviewRevision.captionLengthMaxUsed ??
                effectiveCaptionLengthMax
              }
              messageLengthMax={
                restorePreviewRevision.messageLengthMaxUsed ??
                effectiveMessageLengthMax
              }
              longTextMode={
                restorePreviewRevision.publishMode === "CAPTION_THEN_TEXT"
                  ? "CAPTION_THEN_TEXT"
                  : "IMAGES_THEN_TEXT"
              }
            />
            <div className="space-y-4">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-sm font-medium text-white">
                  {formatManagedPostRevisionReason(
                    t,
                    restorePreviewRevision.reason,
                  )}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {t("telegram.posts.history.createdAt", {
                    date: formatDateTime(
                      restorePreviewRevision.createdAt,
                      locale,
                    ),
                  })}
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-amber-800/70 bg-amber-950/20 p-4 text-sm text-amber-100">
                <p>{t("telegram.posts.editor.restoreWarning")}</p>
                <p className="text-xs text-amber-300/80">
                  {t("telegram.posts.editor.restoreConfirmTitle")}
                </p>
                <p className="rounded-md border border-amber-900/70 bg-black/20 px-3 py-2 font-medium text-white">
                  {editing.title}
                </p>
                <Input
                  value={restoreConfirmationValue}
                  onChange={(event) =>
                    setRestoreConfirmationValue(event.target.value)
                  }
                  placeholder={editing.title}
                  disabled={restorePostRevision.isPending}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRestorePreviewRevision(null);
                    setRestoreConfirmationValue("");
                  }}
                  disabled={restorePostRevision.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  disabled={
                    restorePostRevision.isPending || !restoreConfirmationValid
                  }
                  onClick={() =>
                    restorePostRevision.mutate(restorePreviewRevision)
                  }
                >
                  {restorePostRevision.isPending
                    ? t("telegram.posts.editor.restoring")
                    : t("telegram.posts.editor.restoreVersion")}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        entityName={t("telegram.posts.editor.selectedPosts", {
          count: selectedPosts.length,
        })}
        label={t("telegram.posts.editor.deleteSelected")}
        description={
          selectedPosts.some((post) => post.status === "SCHEDULED")
            ? t("telegram.posts.editor.deleteSelectedScheduledDescription")
            : t("telegram.posts.editor.deleteSelectedDescription")
        }
        onConfirm={() => {
          const postsToDelete = [...selectedPosts];
          setBulkDeleteOpen(false);
          void deletePosts(postsToDelete);
        }}
      />
    </>
  );
}
