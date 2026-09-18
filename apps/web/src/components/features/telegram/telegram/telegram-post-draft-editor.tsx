"use client";

import type { ReactNode } from "react";
import type { TelegramSystemBotPostDraft } from "@telegram-system/shared";
import {
  normalizeTelegramPostMediaItems,
  telegramPostPhotoUrls,
} from "@telegram-system/shared";
import { FormField, Input } from "@/components/ui/primitives";
import { TelegramPostMediaUpload } from "./telegram-post-media-upload";
import { TelegramPostPreview } from "./telegram-post-preview";
import { TelegramTextEditor } from "./telegram-text-editor";

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
          />
        </>
      }
    />
  );
}
