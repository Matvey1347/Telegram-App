"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { TelegramSystemBotPostDraft } from "@telegram-system/shared";
import type { TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import {
  normalizeTelegramPostMediaItems,
  telegramPostPhotoUrls,
} from "@telegram-system/shared";
import { FormField, Input } from "@/components/ui/primitives";
import { TelegramPostMediaUpload } from "./telegram-post-media-upload";
import { TelegramPostPreview } from "./telegram-post-preview";
import { TelegramTextEditor } from "./telegram-text-editor";
import { telegramChannelsApi } from "@/lib/api";

export function TelegramPostDraftEditorLayout({
  preview,
  editor,
  capability = "standard",
}: {
  preview: ReactNode;
  editor: ReactNode;
  capability?: "standard" | "advanced";
}) {
  return (
    <div
      className={
        capability === "advanced"
          ? "grid min-w-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]"
          : "grid items-start gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]"
      }
    >
      <div
        className={
          capability === "advanced"
            ? "min-w-0 xl:sticky xl:top-0 xl:self-start"
            : "w-full max-w-[340px]"
        }
      >
        {preview}
      </div>
      <div
        className={
          capability === "advanced" ? "min-w-0 space-y-3" : "space-y-3"
        }
      >
        {editor}
      </div>
    </div>
  );
}

export function TelegramPostDraftEditor({
  draft,
  channelTitle,
  channelPhotoUrl,
  channelId,
  disabled,
  buttonEditing = "enabled",
  mediaAllowedKinds,
  mediaMaxItems,
  mediaNotice,
  titleField = "visible",
  textPlaceholder = "Write or edit the Telegram post…",
  previewDraft,
  onPreviewTextChange,
  onChange,
}: {
  draft: TelegramSystemBotPostDraft;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  channelId?: string;
  disabled?: boolean;
  buttonEditing?: "enabled" | "disabled";
  mediaAllowedKinds?: import("@telegram-system/shared").TelegramPostMediaKind[];
  mediaMaxItems?: number;
  mediaNotice?: string;
  titleField?: "visible" | "hidden";
  textPlaceholder?: string;
  previewDraft?: TelegramSystemBotPostDraft;
  onPreviewTextChange?: (text: string) => void;
  onChange: (draft: TelegramSystemBotPostDraft) => void;
}) {
  const mediaItems = normalizeTelegramPostMediaItems(
    draft.mediaItems,
    draft.imageUrls,
  );
  const update = (patch: Partial<TelegramSystemBotPostDraft>) =>
    onChange({ ...draft, ...patch });
  const customEmojiDocumentIds = useMemo(
    () => [
      ...new Set(
        [...draft.text.matchAll(/tg:\/\/emoji\?id=(\d{1,20})/g)].map(
          (match) => match[1],
        ),
      ),
    ],
    [draft.text],
  );
  const [customEmojiPacks, setCustomEmojiPacks] = useState<
    TelegramCustomEmojiPackSummary[]
  >([]);
  const [emojiProgress, setEmojiProgress] = useState<{
    current: number;
    total: number;
    loaded: number;
    failed: number;
  } | null>(null);
  const customEmojiDocumentIdsKey = customEmojiDocumentIds.join(",");
  useEffect(() => {
    if (!customEmojiDocumentIds.length) {
      setCustomEmojiPacks([]);
      setEmojiProgress(null);
      return;
    }
    const controller = new AbortController();
    setCustomEmojiPacks([]);
    setEmojiProgress({
      current: 0,
      total: customEmojiDocumentIds.length,
      loaded: 0,
      failed: 0,
    });
    void telegramChannelsApi
      .resolveCustomEmojiDocuments(
        customEmojiDocumentIds,
        (item, current, total) => {
          setEmojiProgress((previous) => ({
            current,
            total,
            loaded:
              (previous?.loaded ?? 0) + (item.status === "failed" ? 0 : 1),
            failed:
              (previous?.failed ?? 0) + (item.status === "failed" ? 1 : 0),
          }));
          if (!item.pack) return;
          setCustomEmojiPacks((previous) => {
            const index = previous.findIndex(
              (pack) => pack.id === item.pack!.id,
            );
            if (index < 0) return [...previous, item.pack!];
            const next = [...previous];
            const existing = next[index]!;
            next[index] = {
              ...existing,
              emojis: [
                ...existing.emojis.filter(
                  (emoji) => emoji.documentId !== item.documentId,
                ),
                ...item.pack!.emojis,
              ],
            };
            return next;
          });
        },
        controller.signal,
      )
      .then((result) => setCustomEmojiPacks(result.packs))
      .catch(() => undefined);
    return () => controller.abort();
  }, [customEmojiDocumentIdsKey]);

  return (
    <TelegramPostDraftEditorLayout
      preview={
        <TelegramPostPreview
          channelTitle={channelTitle}
          channelPhotoUrl={channelPhotoUrl}
          text={previewDraft?.text ?? draft.text}
          plainText={previewDraft?.plainText ?? draft.plainText}
          formattedHtml={previewDraft?.formattedHtml ?? draft.formattedHtml}
          imageUrls={previewDraft?.imageUrls ?? draft.imageUrls}
          mediaItems={previewDraft?.mediaItems ?? mediaItems}
          buttonRows={previewDraft?.buttonRows ?? draft.buttonRows}
          customEmojiPacks={customEmojiPacks}
          onTextChange={onPreviewTextChange}
          captionLengthMax={4_096}
          messageLengthMax={4_096}
        />
      }
      editor={
        <>
          {titleField === "visible" ? (
            <FormField label="Post title" required>
              <Input
                value={draft.title}
                maxLength={160}
                disabled={disabled}
                onChange={(event) => update({ title: event.target.value })}
              />
            </FormField>
          ) : null}
          <FormField label="Post text">
            <TelegramTextEditor
              value={draft.text}
              disabled={disabled}
              onChange={(text) =>
                update({ text, plainText: undefined, formattedHtml: undefined })
              }
              rows={12}
              channelId={channelId}
              enableCustomEmoji
              customEmojiPacks={customEmojiPacks}
              buttonRows={draft.buttonRows}
              onButtonRowsChange={
                buttonEditing === "enabled"
                  ? (buttonRows) => update({ buttonRows })
                  : undefined
              }
              placeholder={textPlaceholder}
            />
          </FormField>
          <TelegramPostMediaUpload
            value={mediaItems}
            disabled={disabled}
            onChange={(nextMedia) =>
              update({
                mediaItems: nextMedia,
                imageUrls: telegramPostPhotoUrls(nextMedia),
              })
            }
            compact
            allowedKinds={mediaAllowedKinds}
            maxItems={mediaMaxItems}
          />
          {emojiProgress ? (
            <p className="-mt-2 text-xs text-muted-foreground" role="status">
              Premium emoji: {emojiProgress.loaded}/{emojiProgress.total} loaded
              {emojiProgress.failed
                ? `, ${emojiProgress.failed} unavailable`
                : ""}
              .
            </p>
          ) : null}
          {mediaNotice ? (
            <p className="-mt-2 text-xs text-amber-300">{mediaNotice}</p>
          ) : null}
        </>
      }
    />
  );
}
