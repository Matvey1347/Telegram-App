"use client";

import { Card, Skeleton } from "@/components/ui/primitives";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
import { TelegramPostPreview } from "./telegram-post-workspace-lazy-views";
import { TelegramDraftEditor } from "./telegram-draft-editor";
import { TelegramPostSidebar } from "./telegram-post-sidebar";
import type { TelegramPostWorkspaceModel } from "./use-telegram-post-workspace";

type Model = Pick<
  TelegramPostWorkspaceModel,
  | "isDeepLinkedPostLoading"
  | "t"
  | "channelTitle"
  | "channelPhotoUrl"
  | "text"
  | "isReadOnlyTelegramPost"
  | "editingMeta"
  | "customEmojiPacks"
  | "imageUrls"
  | "mediaItems"
  | "buttonRows"
  | "textEditorRef"
  | "setText"
  | "longTextMode"
  | "effectiveCaptionLengthMax"
  | "effectiveMessageLengthMax"
  | "editorIsSaving"
  | "editing"
  | "title"
  | "iconPickerGeneration"
  | "icon"
  | "changePostIcon"
  | "setIconPending"
  | "isPublished"
  | "incomingInternalLinkPosts"
  | "setUsageModalOpen"
  | "channelId"
  | "canManageTelegramLink"
  | "setEditing"
  | "changeStatusTab"
  | "busy"
  | "setTitleManuallyEdited"
  | "setTitle"
  | "assignedMemberId"
  | "setMemberSelectionTouched"
  | "setAssignedMemberId"
  | "newPostHypothesisIds"
  | "setNewPostHypothesisIds"
  | "postGroupId"
  | "changePostGroup"
  | "postGroups"
  | "internalLinkScheduledAt"
  | "highlightedInternalLinkTargetId"
  | "highlightRequestKey"
  | "posts"
  | "setCustomEmojiPacksOpen"
  | "setButtonRows"
  | "channelPublishingCapabilities"
  | "checkInlineButtonPublishingAccess"
  | "outgoingInternalLinks"
  | "channelTelegramChatId"
  | "effectivePublishingMode"
  | "highlightInternalLinkTarget"
  | "openPostInNewTab"
  | "isRemoteTelegramPost"
  | "remotePostMediaItems"
  | "setMediaItems"
  | "hasNonReplaceableTelegramMedia"
  | "hasReplaceableTelegramPhotos"
  | "setUploadingImages"
  | "publishedLongImageTextMode"
  | "hasLongImageText"
  | "setLongTextMode"
  | "hasLongTextOnly"
  | "isScheduled"
  | "mode"
  | "setMode"
  | "publicationSlotId"
  | "scheduleTimezone"
  | "setPublicationSlotId"
  | "setScheduleDate"
  | "setScheduleTime"
  | "deleteAfterHours"
  | "setDeleteAfterHours"
  | "pendingPostSaves"
  | "savingPostIds"
  | "canReturnScheduledPostToDraft"
  | "returnManagedPostToDraft"
  | "setHistoryOpen"
  | "run"
  | "publishDisabledReason"
  | "dependencyPublishBlocked"
  | "publishedPostNeedsRepublish"
  | "error"
  | "usageModalOpen"
  | "openPost"
  | "historyOpen"
  | "restorePostRevision"
  | "setRestorePreviewRevision"
  | "setRestoreConfirmationValue"
  | "statusTab"
  | "postSearch"
  | "setPostSearch"
  | "visiblePosts"
  | "visiblePendingPostSaves"
  | "groupedPendingPostSaves"
  | "orderedSidebarSections"
  | "collapsedGroupIds"
  | "selectedPostIds"
  | "setDraggedSidebarKey"
  | "draggedSidebarKey"
  | "setSidebarOrderKeys"
  | "scheduleSidebarOrderSave"
  | "toggleGroupCollapsed"
  | "setSelectedPostIds"
  | "cancelScheduledPostOpen"
  | "togglePostSelected"
  | "schedulePostOpen"
  | "locale"
  | "workspaceTimezone"
  | "setMovingPost"
  | "setDeletingPost"
  | "toggleAllTabPosts"
  | "allTabPostsSelected"
  | "toggleAllChannelPosts"
  | "allChannelPostsSelected"
  | "selectedPosts"
  | "setBulkDeleteOpen"
>;

export function TelegramManagedPostEditor({ model }: { model: Model }) {
  const {
    isDeepLinkedPostLoading,
    t,
    channelTitle,
    channelPhotoUrl,
    text,
    isReadOnlyTelegramPost,
    editingMeta,
    customEmojiPacks,
    imageUrls,
    mediaItems,
    buttonRows,
    textEditorRef,
    setText,
    longTextMode,
    effectiveCaptionLengthMax,
    effectiveMessageLengthMax,
  } = model;
  return (
    <div className="relative grid items-start gap-4 xl:grid-cols-[minmax(270px,0.7fr)_minmax(420px,1.25fr)_minmax(280px,0.72fr)]">
      {isDeepLinkedPostLoading ? (
        <div className="absolute inset-0 z-50 grid gap-4 bg-neutral-950 xl:grid-cols-[minmax(270px,0.7fr)_minmax(420px,1.25fr)_minmax(280px,0.72fr)]">
          <Card className="space-y-4">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-[460px] w-full" />
          </Card>
          <Card className="space-y-4">
            <p className="text-sm text-neutral-400">
              {t("telegram.posts.editor.loadingPost")}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-36 w-full" />
          </Card>
          <Card className="space-y-4">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </Card>
        </div>
      ) : null}
      <TelegramPostPreview
        channelTitle={channelTitle}
        channelPhotoUrl={channelPhotoUrl}
        text={text}
        formattedHtml={
          isReadOnlyTelegramPost ? editingMeta?.formattedText : null
        }
        customEmojiPacks={customEmojiPacks.data?.packs}
        imageUrls={
          isReadOnlyTelegramPost ? (editingMeta?.imageUrls ?? []) : imageUrls
        }
        mediaItems={
          isReadOnlyTelegramPost
            ? normalizeTelegramPostMediaItems(
                editingMeta?.mediaItems,
                editingMeta?.imageUrls,
              )
            : mediaItems
        }
        hasMedia={editingMeta?.hasMedia}
        engagement={editingMeta?.engagementMetrics}
        buttonRows={buttonRows}
        onTextChange={
          isReadOnlyTelegramPost
            ? null
            : (nextValue) => {
                if (textEditorRef.current) {
                  textEditorRef.current.commitExternalChange(nextValue);
                  return;
                }
                setText(nextValue);
              }
        }
        onUndo={
          isReadOnlyTelegramPost ? null : () => textEditorRef.current?.undo()
        }
        onRedo={
          isReadOnlyTelegramPost ? null : () => textEditorRef.current?.redo()
        }
        longTextMode={longTextMode}
        captionLengthMax={effectiveCaptionLengthMax}
        messageLengthMax={effectiveMessageLengthMax}
      />
      <TelegramDraftEditor model={model} />

      <TelegramPostSidebar model={model} />
    </div>
  );
}
