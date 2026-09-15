"use client";

import { useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import type {
  TelegramPostBatchAction,
  TelegramPostBatchChannelOverride,
  TelegramPostBatchLifetimeHours,
  TelegramPostBatchPost,
} from "@telegram-system/shared";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
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
import { setOverrideSchedule, setPostSchedule } from "./post-batch-model";
import { PostBatchScheduleFields } from "./post-batch-schedule-fields";

const lifetimeOptions = [
  { value: "24", labelKey: "telegram.posts.batch.lifetime24" },
  { value: "48", labelKey: "telegram.posts.batch.lifetime48" },
  { value: "72", labelKey: "telegram.posts.batch.lifetime72" },
  { value: "permanent", labelKey: "telegram.posts.batch.permanent" },
] as const;

function lifetimeValue(value: string): TelegramPostBatchLifetimeHours {
  return value === "permanent" ? null : (Number(value) as 24 | 48 | 72);
}

function updateOverride(
  overrides: TelegramPostBatchChannelOverride[],
  channelId: string,
  update: (
    current: TelegramPostBatchChannelOverride,
  ) => TelegramPostBatchChannelOverride,
) {
  const current = overrides.find(
    (override) => override.telegramChannelId === channelId,
  ) ?? { telegramChannelId: channelId };
  const next = update(current);
  return [
    ...overrides.filter((override) => override.telegramChannelId !== channelId),
    next,
  ];
}

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
  const [overridesOpen, setOverridesOpen] = useState(false);
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
          <span className="text-xs text-neutral-500">
            {t("telegram.posts.batch.mediaCount", {
              count: post.mediaItems.length || post.imageUrls.length,
            })}
          </span>
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

      <div className="grid gap-3 md:grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)]">
        <FormField label={t("telegram.posts.import.icon")}>
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

      <div className="mt-3 grid min-w-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="order-2 min-w-0 space-y-3">
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
        </div>
        <aside className="order-1 min-w-0 xl:sticky xl:top-0 xl:self-start">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
            {t("telegram.posts.batch.preview")}
          </p>
          <TelegramPostPreview
            channelTitle={
              previewChannel?.title ?? t("telegram.posts.batch.previewChannel")
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
            longTextMode={post.longTextMode}
            captionLengthMax={capabilities?.captionLengthMax}
            messageLengthMax={capabilities?.messageLengthMax}
            buttonRows={post.buttonRows}
          />
        </aside>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FormField label={t("telegram.posts.batch.lifetime")}>
          <CustomSelect
            uiLocale={locale}
            value={post.deleteAfterHours?.toString() ?? "permanent"}
            disabled={disabled}
            searchable={false}
            options={lifetimeOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            onChange={(value) =>
              onChange({ ...post, deleteAfterHours: lifetimeValue(value) })
            }
          />
        </FormField>
        <FormField label={t("telegram.posts.batch.longTextMode")}>
          <CustomSelect
            uiLocale={locale}
            value={post.longTextMode}
            disabled={disabled}
            searchable={false}
            options={[
              {
                value: "IMAGES_THEN_TEXT",
                label: t("telegram.posts.batch.imagesThenText"),
              },
              {
                value: "CAPTION_THEN_TEXT",
                label: t("telegram.posts.batch.captionThenText"),
              },
            ]}
            onChange={(value) =>
              onChange({
                ...post,
                longTextMode: value as TelegramPostBatchPost["longTextMode"],
              })
            }
          />
          <p className="mt-1 text-xs text-neutral-500">
            {post.longTextMode === "CAPTION_THEN_TEXT"
              ? t("telegram.posts.batch.captionThenTextHint")
              : t("telegram.posts.batch.imagesThenTextHint")}
          </p>
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
                onChange({ ...post, scheduledAt });
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

      <Button
        type="button"
        variant="secondary"
        className="mt-4 w-full justify-between"
        disabled={disabled || !selectedChannels.length}
        onClick={() => setOverridesOpen((value) => !value)}
      >
        <span>
          {t("telegram.posts.batch.channelOverrides", {
            count: post.channelOverrides.length,
          })}
        </span>
        {overridesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </Button>

      {overridesOpen ? (
        <div className="mt-3 space-y-2">
          {selectedChannels.map((channel) => {
            const override = post.channelOverrides.find(
              (item) => item.telegramChannelId === channel.id,
            );
            const overrideAction = override?.action ?? "";
            return (
              <div
                key={channel.id}
                className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-neutral-200">
                    {channel.title}
                  </span>
                  {override ? (
                    <button
                      type="button"
                      aria-label={t("telegram.posts.batch.clearOverride")}
                      disabled={disabled}
                      onClick={() =>
                        onChange({
                          ...post,
                          channelOverrides: post.channelOverrides.filter(
                            (item) => item.telegramChannelId !== channel.id,
                          ),
                        })
                      }
                      className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                    >
                      <RotateCcw size={15} />
                    </button>
                  ) : null}
                </div>
                <CustomSelect
                  uiLocale={locale}
                  value={overrideAction}
                  disabled={disabled}
                  searchable={false}
                  options={[
                    {
                      value: "",
                      label: t("telegram.posts.batch.inheritAction"),
                    },
                    ...actionOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                      iconEmoji: option.iconEmoji,
                    })),
                  ]}
                  onChange={(value) =>
                    onChange({
                      ...post,
                      channelOverrides:
                        value === ""
                          ? post.channelOverrides.filter(
                              (item) => item.telegramChannelId !== channel.id,
                            )
                          : updateOverride(
                              post.channelOverrides,
                              channel.id,
                              (current) =>
                                setOverrideSchedule(
                                  current,
                                  value as TelegramPostBatchAction,
                                ),
                            ),
                    })
                  }
                />
                {overrideAction === "SCHEDULE" ? (
                  <div className="mt-2">
                    <PostBatchScheduleFields
                      value={override?.scheduledAt ?? null}
                      disabled={disabled}
                      dateLabel={t("telegram.posts.batch.overrideDate", {
                        channel: channel.title,
                      })}
                      timeLabel={t("telegram.posts.batch.overrideTime", {
                        channel: channel.title,
                      })}
                      onChange={(scheduledAt) =>
                        onChange({
                          ...post,
                          channelOverrides: updateOverride(
                            post.channelOverrides,
                            channel.id,
                            (current) => ({
                              ...current,
                              action: "SCHEDULE",
                              scheduledAt,
                            }),
                          ),
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
