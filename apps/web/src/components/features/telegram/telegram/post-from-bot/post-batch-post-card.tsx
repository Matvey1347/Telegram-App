"use client";

import { useRef, useState } from "react";
import { Bot, LoaderCircle } from "lucide-react";
import type {
  TelegramPostBatchAction,
  TelegramPostBatchPost,
} from "@telegram-system/shared";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
  Select,
} from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  TelegramTextEditor,
  type TelegramTextEditorHandle,
} from "../telegram-text-editor";
import { TelegramPostMediaUpload } from "../telegram-post-media-upload";
import { TelegramPostPreview } from "../telegram-post-preview";
import { PublicationSlotOccurrenceSelect } from "../publication-slot-occurrence-select";
import { managedPostScheduleUi } from "../managed-post-presentation";
import { setPostSchedule } from "./post-batch-model";
import { PostBatchScheduleFields } from "./post-batch-schedule-fields";
import { PostBatchChannelOverrides } from "./post-batch-channel-overrides";
import { TelegramPostDraftEditorLayout } from "../telegram-post-draft-editor";
import {
  POST_BATCH_FORMAT_OPTIONS,
  postBatchFormatValue,
  postBatchLifetimeFromFormat,
} from "./post-batch-format";

export function PostBatchPostCard({
  post,
  index,
  channels,
  channelIds,
  disabled,
  botImporting = false,
  canImportFromBot = false,
  onImportFromBot,
  onChange,
}: {
  post: TelegramPostBatchPost;
  index: number;
  channels: TelegramChannelSelectOption[];
  channelIds: string[];
  disabled?: boolean;
  botImporting?: boolean;
  canImportFromBot?: boolean;
  onImportFromBot?: () => void;
  onChange: (post: TelegramPostBatchPost) => void;
}) {
  const { locale, t } = useI18n();
  const editorRef = useRef<TelegramTextEditorHandle>(null);
  const [slotValue, setSlotValue] = useState<string | null>(null);
  const selectedChannels = channels.filter((channel) =>
    channelIds.includes(channel.id),
  );
  const previewChannel = selectedChannels[0];
  const capabilities = previewChannel?.publishingCapabilities;
  const actionOptions = [
    {
      value: "PUBLISH_NOW",
      label: t("telegram.posts.editor.publishNow"),
      iconEmoji: "🚀",
    },
    {
      value: "SCHEDULE",
      label: managedPostScheduleUi({
        hasInlineButtons: post.buttonRows.length > 0,
        t,
      }).label,
      iconEmoji: "🕒",
    },
  ] as const;

  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950/55 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-white">
          {t("telegram.posts.batch.postNumber", { number: index + 1 })}
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {onImportFromBot ? (
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || !canImportFromBot || botImporting}
              onClick={onImportFromBot}
            >
              {botImporting ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Bot size={16} />
              )}
              {botImporting
                ? t("telegram.posts.batch.waitingForBot")
                : t("telegram.posts.batch.sendPostViaBot")}
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <TelegramPostDraftEditorLayout
          capability="advanced"
          editor={
            <>
              <div
                data-testid="post-batch-identity-fields"
                className="grid gap-3 md:grid-cols-[40px_minmax(0,1fr)]"
              >
                <FormField label={t("telegram.posts.batch.icon")}>
                  <IconPicker
                    compact
                    allowImages={false}
                    disabled={disabled}
                    iconId={post.iconId}
                    icon={post.iconPresentation}
                    buttonLabel={t("telegram.posts.icon.addEmoji")}
                    className="!h-10 !w-10"
                    iconClassName="!h-7 !w-7 !bg-transparent"
                    onChange={(iconId, iconPresentation) =>
                      onChange({
                        ...post,
                        iconId,
                        iconPresentation: iconPresentation ?? null,
                      })
                    }
                  />
                </FormField>
                <FormField label={t("telegram.posts.batch.postTitle")}>
                  <Input
                    value={post.title}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({ ...post, title: event.target.value })
                    }
                  />
                </FormField>
              </div>
              <FormField label={t("telegram.posts.batch.telegramText")}>
                <TelegramTextEditor
                  ref={editorRef}
                  value={post.text ?? ""}
                  disabled={disabled}
                  rows={10}
                  channelId={previewChannel?.id}
                  currentPostId={null}
                  enableInternalPostLinks={Boolean(previewChannel)}
                  internalLinkUsage={
                    post.action === "SCHEDULE" ? "schedule" : "publishNow"
                  }
                  internalLinkScheduledAt={post.scheduledAt ?? undefined}
                  buttonRows={post.buttonRows}
                  onButtonRowsChange={(buttonRows) =>
                    onChange({ ...post, buttonRows })
                  }
                  canPublishInlineButtons={
                    capabilities?.canPublishInlineButtons ?? true
                  }
                  enableCustomEmoji={capabilities?.supportsCustomEmoji ?? false}
                  onChange={(text) => onChange({ ...post, text: text || null })}
                />
              </FormField>
              <TelegramPostMediaUpload
                value={post.mediaItems}
                disabled={disabled}
                onChange={(mediaItems) =>
                  onChange({
                    ...post,
                    mediaItems,
                    imageUrls: mediaItems
                      .filter((item) => item.kind === "PHOTO")
                      .map((item) => item.url),
                  })
                }
              />
            </>
          }
          preview={
            <aside>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                {t("telegram.posts.batch.preview")}
              </p>
              <TelegramPostPreview
                channelTitle={
                  previewChannel?.title ??
                  t("telegram.posts.batch.previewChannel")
                }
                channelPhotoUrl={previewChannel?.photoUrl}
                text={post.text ?? ""}
                imageUrls={post.imageUrls}
                mediaItems={post.mediaItems}
                onTextChange={
                  disabled
                    ? null
                    : (text) => editorRef.current?.commitExternalChange(text)
                }
                onUndo={disabled ? null : () => editorRef.current?.undo()}
                onRedo={disabled ? null : () => editorRef.current?.redo()}
                captionLengthMax={capabilities?.captionLengthMax}
                messageLengthMax={capabilities?.messageLengthMax}
                buttonRows={post.buttonRows}
              />
            </aside>
          }
        />
      </div>

      <div
        data-testid="post-batch-delivery-fields"
        className="mt-3 grid gap-3 md:grid-cols-2"
      >
        <FormField label={t("telegram.posts.batch.format")}>
          <Select
            value={postBatchFormatValue(post.deleteAfterHours)}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...post,
                deleteAfterHours: postBatchLifetimeFromFormat(
                  event.target.value,
                ),
              })
            }
          >
            {POST_BATCH_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("telegram.posts.batch.action")}>
          <CustomSelect
            uiLocale={locale}
            value={post.action}
            dropdownDirection="up"
            disabled={disabled}
            searchable={false}
            options={actionOptions.map((option) => ({
              value: option.value,
              label: option.label,
              iconEmoji: option.iconEmoji,
            }))}
            onChange={(value) =>
              onChange(setPostSchedule(post, value as TelegramPostBatchAction))
            }
          />
        </FormField>
      </div>

      {post.action === "SCHEDULE" ? (
        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/45 p-3">
          {previewChannel ? (
            <PublicationSlotOccurrenceSelect
              channelId={previewChannel.id}
              value={slotValue}
              scheduledAt={post.scheduledAt}
              disabled={disabled}
              onChange={({ slotId, scheduledAt }) => {
                setSlotValue(slotId ? `${slotId}:${scheduledAt}` : null);
                onChange({
                  ...post,
                  scheduledAt,
                  channelOverrides: post.channelOverrides.map((override) =>
                    override.action === "SCHEDULE"
                      ? { ...override, scheduledAt }
                      : override,
                  ),
                });
              }}
            />
          ) : (
            <PostBatchScheduleFields
              value={post.scheduledAt}
              disabled={disabled}
              dateLabel={t("telegram.posts.batch.date")}
              timeLabel={t("telegram.posts.batch.time")}
              onChange={(scheduledAt) => onChange({ ...post, scheduledAt })}
            />
          )}
        </div>
      ) : null}

      <PostBatchChannelOverrides
        post={post}
        channels={selectedChannels}
        disabled={disabled}
        onChange={onChange}
      />
    </article>
  );
}
