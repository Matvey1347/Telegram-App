"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
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
  DateInput,
  FormField,
  Input,
  Textarea,
  TimeInput,
} from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import {
  defaultScheduleIso,
  localScheduleParts,
  scheduleIso,
  setOverrideSchedule,
  setPostSchedule,
} from "./post-batch-model";

const actionOptions = [
  { value: "PUBLISH_NOW", labelKey: "telegram.posts.batch.publishNow" },
  { value: "SCHEDULE", labelKey: "telegram.posts.batch.schedule" },
] as const;

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

function ScheduleFields({
  value,
  disabled,
  dateLabel,
  timeLabel,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  dateLabel: string;
  timeLabel: string;
  onChange: (value: string | null) => void;
}) {
  const [initial] = useState(() =>
    localScheduleParts(value ?? defaultScheduleIso()),
  );
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label={dateLabel}>
        <DateInput
          value={date}
          disabled={disabled}
          onChange={(event) => {
            const nextDate = event.target.value;
            setDate(nextDate);
            onChange(scheduleIso(nextDate, time));
          }}
        />
      </FormField>
      <FormField label={timeLabel}>
        <TimeInput
          value={time}
          disabled={disabled}
          onChange={(event) => {
            const nextTime = event.target.value;
            setTime(nextTime);
            onChange(scheduleIso(date, nextTime));
          }}
        />
      </FormField>
    </div>
  );
}

export function PostBatchPostCard({
  post,
  index,
  channels,
  channelIds,
  disabled,
  onChange,
}: {
  post: TelegramPostBatchPost;
  index: number;
  channels: TelegramChannelSelectOption[];
  channelIds: string[];
  disabled?: boolean;
  onChange: (post: TelegramPostBatchPost) => void;
}) {
  const { locale, t } = useI18n();
  const [overridesOpen, setOverridesOpen] = useState(false);
  const selectedChannels = channels.filter((channel) =>
    channelIds.includes(channel.id),
  );

  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950/55 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-white">
          {t("telegram.posts.batch.postNumber", { number: index + 1 })}
        </h4>
        <span className="text-xs text-neutral-500">
          {t("telegram.posts.batch.mediaCount", {
            count: post.mediaItems.length || post.imageUrls.length,
          })}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
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
            disabled={disabled}
            searchable={false}
            options={actionOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            onChange={(value) =>
              onChange(setPostSchedule(post, value as TelegramPostBatchAction))
            }
          />
        </FormField>
      </div>

      <div className="mt-3">
        <FormField label={t("telegram.posts.batch.telegramText")}>
          <Textarea
            value={post.text ?? ""}
            disabled={disabled}
            rows={5}
            onChange={(event) =>
              onChange({ ...post, text: event.target.value || null })
            }
          />
        </FormField>
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
        </FormField>
      </div>

      {post.action === "SCHEDULE" ? (
        <div className="mt-3">
          <ScheduleFields
            value={post.scheduledAt}
            disabled={disabled}
            dateLabel={t("telegram.posts.batch.date")}
            timeLabel={t("telegram.posts.batch.time")}
            onChange={(scheduledAt) => onChange({ ...post, scheduledAt })}
          />
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
                      label: t(option.labelKey),
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
                    <ScheduleFields
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
