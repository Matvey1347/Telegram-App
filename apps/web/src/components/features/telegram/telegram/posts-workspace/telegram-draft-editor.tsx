"use client";

import {
  Card,
  FormField,
  Input,
  CustomSelect,
  Select,
  Button,
} from "@/components/ui/primitives";
import {
  LoaderCircle,
  Layers3,
  CheckCircle2,
  RotateCcw,
  History,
} from "lucide-react";
import { ManagedPostReadOnlyPanel } from "@/components/features/telegram/telegram/managed-post-read-only-panel";
import { IconPicker } from "@/components/icons/icon-picker";
import { ManagedPostTelegramLink } from "@/components/features/telegram/telegram/managed-post-telegram-link";
import {
  publishModeLabel,
  LongImageTextModePanel,
  managedPostScheduleUi,
} from "@/components/features/telegram/telegram/managed-post-presentation";
import { normalizeTelegramPostMediaItems } from "@telegram-system/shared";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { ManagedPostHypothesisSelector } from "@/components/features/telegram/telegram/managed-post-hypothesis-selector";
import { telegramPostGroupTitle } from "@/components/features/telegram/telegram/telegram-post-group-title";
import { LazyTelegramTextEditor } from "@/components/features/telegram/telegram/lazy-telegram-text-editor";
import { ManagedPostInternalLinksNotice } from "@/components/features/telegram/telegram/managed-post-internal-links-notice";
import { TelegramPostMediaUpload } from "@/components/features/telegram/telegram/telegram-post-media-upload";
import { PublicationSlotOccurrenceSelect } from "@/components/features/telegram/telegram/publication-slot-occurrence-select";
import {
  postBatchFormatValue,
  postBatchLifetimeFromFormat,
  POST_BATCH_FORMAT_OPTIONS,
} from "@/components/features/telegram/telegram/post-from-bot/post-batch-format";
import { TelegramPostSendToBotButton } from "@/components/features/telegram/telegram/telegram-post-send-to-bot-button";
import {
  EMPTY_HYPOTHESIS_IDS,
  selectIconProps,
  type PublishingMode,
  localDateTimeParts,
} from "./telegram-post-workspace-model";
import { PostUsageModal } from "../managed-post-usage-modal";
import { ManagedPostHistoryModal } from "./telegram-post-workspace-lazy-views";
import type { TelegramPostWorkspaceModel } from "./use-telegram-post-workspace";

type Model = Pick<
  TelegramPostWorkspaceModel,
  | "editorIsSaving"
  | "t"
  | "editing"
  | "title"
  | "isReadOnlyTelegramPost"
  | "editingMeta"
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
  | "textEditorRef"
  | "text"
  | "setText"
  | "internalLinkScheduledAt"
  | "highlightedInternalLinkTargetId"
  | "highlightRequestKey"
  | "posts"
  | "setCustomEmojiPacksOpen"
  | "buttonRows"
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
  | "mediaItems"
  | "setMediaItems"
  | "hasNonReplaceableTelegramMedia"
  | "hasReplaceableTelegramPhotos"
  | "setUploadingImages"
  | "publishedLongImageTextMode"
  | "hasLongImageText"
  | "longTextMode"
  | "setLongTextMode"
  | "hasLongTextOnly"
  | "effectiveMessageLengthMax"
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
  | "imageUrls"
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
>;

export function TelegramDraftEditor({ model }: { model: Model }) {
  const {
    editorIsSaving,
    t,
    editing,
    title,
    isReadOnlyTelegramPost,
    editingMeta,
    iconPickerGeneration,
    icon,
    changePostIcon,
    setIconPending,
    isPublished,
    incomingInternalLinkPosts,
    setUsageModalOpen,
    channelId,
    canManageTelegramLink,
    setEditing,
    changeStatusTab,
    busy,
    setTitleManuallyEdited,
    setTitle,
    assignedMemberId,
    setMemberSelectionTouched,
    setAssignedMemberId,
    newPostHypothesisIds,
    setNewPostHypothesisIds,
    postGroupId,
    changePostGroup,
    postGroups,
    textEditorRef,
    text,
    setText,
    internalLinkScheduledAt,
    highlightedInternalLinkTargetId,
    highlightRequestKey,
    posts,
    setCustomEmojiPacksOpen,
    buttonRows,
    setButtonRows,
    channelPublishingCapabilities,
    checkInlineButtonPublishingAccess,
    outgoingInternalLinks,
    channelTelegramChatId,
    effectivePublishingMode,
    highlightInternalLinkTarget,
    openPostInNewTab,
    isRemoteTelegramPost,
    remotePostMediaItems,
    mediaItems,
    setMediaItems,
    hasNonReplaceableTelegramMedia,
    hasReplaceableTelegramPhotos,
    setUploadingImages,
    publishedLongImageTextMode,
    hasLongImageText,
    longTextMode,
    setLongTextMode,
    hasLongTextOnly,
    effectiveMessageLengthMax,
    isScheduled,
    mode,
    setMode,
    publicationSlotId,
    scheduleTimezone,
    setPublicationSlotId,
    setScheduleDate,
    setScheduleTime,
    deleteAfterHours,
    setDeleteAfterHours,
    pendingPostSaves,
    savingPostIds,
    canReturnScheduledPostToDraft,
    returnManagedPostToDraft,
    setHistoryOpen,
    imageUrls,
    run,
    publishDisabledReason,
    dependencyPublishBlocked,
    publishedPostNeedsRepublish,
    error,
    usageModalOpen,
    openPost,
    historyOpen,
    restorePostRevision,
    setRestorePreviewRevision,
    setRestoreConfirmationValue,
  } = model;
  return (
    <Card className="relative min-w-0 space-y-3 overflow-visible">
      {editorIsSaving ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-black/55 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-sm font-medium text-white shadow-2xl">
            <LoaderCircle size={21} className="animate-spin text-blue-400" />
            {t("telegram.posts.editor.savingNamed", {
              title: editing?.title || title,
            })}
          </div>
        </div>
      ) : null}
      {isReadOnlyTelegramPost && editingMeta ? (
        <div className="absolute inset-0 z-50 rounded-lg bg-neutral-900 p-4">
          <ManagedPostReadOnlyPanel
            title={editingMeta.title}
            telegramUrl={editingMeta.primaryTelegramMessageUrl}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <IconPicker
              key={iconPickerGeneration}
              iconId={icon}
              onChange={changePostIcon}
              onPendingChange={setIconPending}
              buttonLabel={t("telegram.posts.icon.addIcon")}
              iconOnly
              compact
              className="!h-8 !w-8"
            />
            <h2 className="text-lg font-semibold text-white">
              {isPublished
                ? t("telegram.posts.editor.publishedPost")
                : editing
                  ? t("telegram.posts.editor.editPost")
                  : t("telegram.posts.newPost")}
            </h2>
            {editing && incomingInternalLinkPosts.length > 0 ? (
              <button
                type="button"
                onClick={() => setUsageModalOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 text-xs font-medium text-neutral-300 transition hover:border-blue-600 hover:bg-blue-950/30 hover:text-white"
                title={t("telegram.posts.editor.showLinks")}
              >
                <Layers3 size={13} />
                {t("telegram.posts.groups.usedInPosts")}
                <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-200">
                  {incomingInternalLinkPosts.length}
                </span>
              </button>
            ) : null}
            {editingMeta ? (
              <ManagedPostTelegramLink
                channelId={channelId}
                post={editingMeta}
                canManage={canManageTelegramLink}
                onPostUpdated={(post) => {
                  setEditing(post);
                  if (post.status === "DRAFT") changeStatusTab("DRAFT");
                }}
              />
            ) : null}
          </div>
          {isPublished ? (
            <div className="mt-0.5 space-y-0.5 text-xs">
              <p className="flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 size={13} />
                {t("telegram.posts.editor.publishedEditable")}
              </p>
              <p className="text-neutral-400">
                {publishModeLabel(
                  t,
                  editing?.publishMode,
                  normalizeTelegramPostMediaItems(
                    editing?.mediaItems,
                    editing?.imageUrls,
                  ).length,
                  editing?.text?.length || 0,
                )}
              </p>
            </div>
          ) : null}
        </div>
        <div className="grid w-full gap-3 md:grid-cols-2">
          <FormField label={t("telegram.posts.editor.title")} required>
            <Input
              value={title}
              disabled={busy}
              onChange={(event) => {
                setTitleManuallyEdited(true);
                setTitle(event.target.value);
              }}
            />
          </FormField>
          <FormField label={t("telegram.posts.editor.member")}>
            <MemberSelect
              value={assignedMemberId}
              onChange={(value) => {
                setMemberSelectionTouched(true);
                setAssignedMemberId(value || null);
              }}
              defaultToCurrent={!editing}
              disabled={busy}
            />
          </FormField>
        </div>
        <div className="grid w-full gap-3 md:grid-cols-2">
          <ManagedPostHypothesisSelector
            channelId={channelId}
            postId={editing?.id}
            value={editing ? EMPTY_HYPOTHESIS_IDS : newPostHypothesisIds}
            onChange={setNewPostHypothesisIds}
          />
          <div className="min-w-0">
            <FormField label={t("telegram.posts.editor.group")}>
              <CustomSelect
                value={postGroupId || ""}
                onChange={changePostGroup}
                placeholder={t("telegram.posts.editor.noGroup")}
                options={[
                  {
                    value: "",
                    label: t("telegram.posts.editor.noGroup"),
                    iconEmoji: "📂",
                  },
                  ...(postGroups.data || []).map((group) => ({
                    value: group.id,
                    label: telegramPostGroupTitle(group, t),
                    ...selectIconProps(group.iconPresentation),
                    iconFallback: telegramPostGroupTitle(group, t),
                  })),
                ]}
              />
            </FormField>
          </div>
        </div>
      </div>
      <FormField label={t("telegram.posts.editor.text")}>
        <LazyTelegramTextEditor
          editorRef={textEditorRef}
          value={text}
          onChange={setText}
          disabled={busy}
          rows={7}
          channelId={channelId}
          currentPostId={editing?.id}
          enableInternalPostLinks
          internalLinkUsage="edit"
          internalLinkScheduledAt={internalLinkScheduledAt}
          highlightInternalLinkTargetId={highlightedInternalLinkTargetId}
          highlightRequestKey={highlightRequestKey}
          availableInternalPosts={posts.data || []}
          enableCustomEmoji
          onManageCustomEmojiPacks={() => setCustomEmojiPacksOpen(true)}
          buttonRows={buttonRows}
          onButtonRowsChange={setButtonRows}
          canPublishInlineButtons={Boolean(
            channelPublishingCapabilities?.canPublishInlineButtons,
          )}
          onCheckInlineButtonPublishingAccess={
            checkInlineButtonPublishingAccess
          }
        />
      </FormField>
      <ManagedPostInternalLinksNotice
        links={outgoingInternalLinks}
        channelTelegramChatId={channelTelegramChatId}
        allowUnresolved={effectivePublishingMode === "schedule"}
        onHighlightTarget={highlightInternalLinkTarget}
        onOpenPostInNewTab={openPostInNewTab}
      />
      {!isRemoteTelegramPost || remotePostMediaItems.length ? (
        <div className="space-y-2">
          <TelegramPostMediaUpload
            value={mediaItems}
            onChange={setMediaItems}
            disabled={busy || hasNonReplaceableTelegramMedia}
            readOnly={hasNonReplaceableTelegramMedia}
            allowedKinds={hasReplaceableTelegramPhotos ? ["PHOTO"] : undefined}
            maxItems={
              hasReplaceableTelegramPhotos
                ? remotePostMediaItems.length
                : undefined
            }
            onUploadingChange={setUploadingImages}
          />
          {hasReplaceableTelegramPhotos ? (
            <p className="text-xs text-amber-300">
              {t("telegram.posts.editor.photosReplaceable")}
            </p>
          ) : hasNonReplaceableTelegramMedia ? (
            <p className="text-xs text-amber-300">
              {t("telegram.posts.editor.mediaNotReplaceable")}
            </p>
          ) : null}
        </div>
      ) : null}
      {publishedLongImageTextMode ? (
        <LongImageTextModePanel
          mode={publishedLongImageTextMode}
          readOnly
          textLength={text.length}
        />
      ) : null}
      {!isPublished && hasLongImageText ? (
        <LongImageTextModePanel
          mode={longTextMode}
          onChange={setLongTextMode}
          textLength={text.length}
        />
      ) : null}
      {!isPublished && hasLongTextOnly ? (
        <div className="rounded-lg border border-blue-700/60 bg-blue-950/20 p-3">
          <p className="text-sm text-blue-200">
            {t("telegram.posts.editor.longTextOnly", {
              length: text.length,
              count: Math.ceil(text.length / effectiveMessageLengthMax),
            })}
          </p>
        </div>
      ) : null}
      {!isPublished && !isScheduled ? (
        <FormField label={t("telegram.posts.editor.publishingMode")}>
          <CustomSelect
            value={mode}
            dropdownDirection="up"
            searchable={false}
            onChange={(value) => setMode(value as PublishingMode)}
            options={[
              {
                value: "draft",
                label: t("telegram.posts.editor.saveDraft"),
                iconEmoji: "📝",
              },
              {
                value: "publish",
                label: t("telegram.posts.editor.publishNow"),
                iconEmoji: "🚀",
              },
              {
                value: "schedule",
                label: managedPostScheduleUi({
                  hasInlineButtons: buttonRows.length > 0,
                  t,
                }).label,
                iconEmoji: "🕒",
              },
            ]}
          />
        </FormField>
      ) : null}
      {!isPublished && effectivePublishingMode === "schedule" ? (
        <div className="space-y-3">
          <PublicationSlotOccurrenceSelect
            channelId={channelId}
            value={
              publicationSlotId && internalLinkScheduledAt
                ? `${publicationSlotId}:${internalLinkScheduledAt}`
                : null
            }
            scheduledAt={internalLinkScheduledAt}
            timezone={scheduleTimezone}
            onChange={({ slotId, scheduledAt }) => {
              const local = localDateTimeParts(scheduledAt, scheduleTimezone);
              setPublicationSlotId(slotId);
              setScheduleDate(local.date);
              setScheduleTime(local.time);
            }}
          />
        </div>
      ) : null}
      <FormField label="Remove after publication">
        <div className="space-y-1.5">
          <Select
            value={postBatchFormatValue(
              deleteAfterHours as 24 | 48 | 72 | null,
            )}
            onChange={(event) =>
              setDeleteAfterHours(
                postBatchLifetimeFromFormat(event.target.value),
              )
            }
          >
            {POST_BATCH_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-neutral-500">
            The post will be deleted from Telegram after publication.
          </p>
        </div>
      </FormField>
      {pendingPostSaves.length + savingPostIds.length > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-blue-800/70 bg-blue-950/20 px-3 py-2 text-xs text-blue-200">
          <LoaderCircle size={14} className="animate-spin" />
          {t("telegram.posts.calendar.savingBackground", {
            count: pendingPostSaves.length + savingPostIds.length,
          })}
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {editing || canReturnScheduledPostToDraft ? (
          <div className="flex min-w-0 gap-2">
            {editing && canReturnScheduledPostToDraft ? (
              <Button
                type="button"
                variant="secondary"
                className="min-w-0 flex-1 sm:flex-none"
                disabled={editorIsSaving || returnManagedPostToDraft.isPending}
                onClick={() => void returnManagedPostToDraft.mutateAsync()}
              >
                <RotateCcw size={15} />
                {returnManagedPostToDraft.isPending
                  ? t("telegram.posts.editor.returning")
                  : t("telegram.posts.editor.returnDraft")}
              </Button>
            ) : null}
            {editing ? (
              <button
                type="button"
                title={t("telegram.posts.editor.history")}
                aria-label={t("telegram.posts.editor.openHistory")}
                onClick={() => setHistoryOpen(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 transition hover:border-blue-600 hover:bg-blue-950/30 hover:text-white"
              >
                <History size={17} />
              </button>
            ) : null}
          </div>
        ) : null}
        <TelegramPostSendToBotButton
          disabled={busy || editorIsSaving}
          draft={{
            title,
            text,
            imageUrls,
            mediaItems,
            buttonRows,
          }}
        />
        <Button
          onClick={run}
          disabled={!!publishDisabledReason || dependencyPublishBlocked}
          className="w-full sm:w-auto"
        >
          {publishedPostNeedsRepublish
            ? t("telegram.posts.editor.publish")
            : isPublished
              ? t("telegram.posts.editor.updateText")
              : effectivePublishingMode === "draft"
                ? t("telegram.posts.editor.saveDraftAction")
                : effectivePublishingMode === "publish"
                  ? t("telegram.posts.editor.publishNow")
                  : isScheduled
                    ? t("telegram.posts.editor.updateScheduled")
                    : t("telegram.posts.editor.schedulePost")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-right text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      {publishDisabledReason ? (
        <p className="text-right text-xs text-neutral-500">
          {publishDisabledReason}
        </p>
      ) : null}
      {dependencyPublishBlocked && !publishDisabledReason ? (
        <p className="text-right text-xs text-amber-400">
          {t("telegram.posts.editor.publishDependenciesFirst")}
        </p>
      ) : null}
      {editing && usageModalOpen ? (
        <PostUsageModal
          post={editing}
          usages={incomingInternalLinkPosts}
          onClose={() => setUsageModalOpen(false)}
          onOpenPost={(post) => {
            setUsageModalOpen(false);
            openPost(post);
          }}
          onOpenPostInNewTab={(post) => {
            openPostInNewTab(post);
          }}
        />
      ) : null}
      {editing && historyOpen ? (
        <ManagedPostHistoryModal
          open
          channelId={channelId}
          postId={editing.id}
          restorePending={restorePostRevision.isPending}
          onClose={() => setHistoryOpen(false)}
          onRestore={(revision) => {
            setHistoryOpen(false);
            setRestorePreviewRevision(revision);
            setRestoreConfirmationValue("");
          }}
        />
      ) : null}
    </Card>
  );
}
