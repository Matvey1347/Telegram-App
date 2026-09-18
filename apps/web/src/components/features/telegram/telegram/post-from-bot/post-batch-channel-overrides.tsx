"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import type {
  TelegramPostBatchAction,
  TelegramPostBatchChannelOverride,
  TelegramPostBatchPost,
} from "@telegram-system/shared";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import { Button, CustomSelect } from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { useI18n } from "@/providers/i18n-provider";
import { formatDateTime } from "@/lib/date-format";
import { managedPostScheduleUi } from "../managed-post-presentation";
import { PublicationSlotOccurrenceSelect } from "../publication-slot-occurrence-select";
import { setOverrideSchedule } from "./post-batch-model";

function ChannelOverrideSchedule({
  channelId,
  scheduledAt,
  disabled,
  onChange,
}: {
  channelId: string;
  scheduledAt: string | null;
  disabled?: boolean;
  onChange: (scheduledAt: string) => void;
}) {
  const [slotValue, setSlotValue] = useState<string | null>(null);
  return (
    <PublicationSlotOccurrenceSelect
      channelId={channelId}
      value={slotValue}
      scheduledAt={scheduledAt}
      disabled={disabled}
      onChange={({ slotId, scheduledAt: nextScheduledAt }) => {
        setSlotValue(slotId ? `${slotId}:${nextScheduledAt}` : null);
        onChange(nextScheduledAt);
      }}
    />
  );
}

function updateOverride(
  overrides: TelegramPostBatchChannelOverride[],
  channelId: string,
  update: (
    current: TelegramPostBatchChannelOverride,
  ) => TelegramPostBatchChannelOverride,
) {
  const current = overrides.find(
    (item) => item.telegramChannelId === channelId,
  ) ?? {
    telegramChannelId: channelId,
  };
  return [
    ...overrides.filter((item) => item.telegramChannelId !== channelId),
    update(current),
  ];
}

export function PostBatchChannelOverrides({
  post,
  channels,
  disabled,
  onChange,
}: {
  post: TelegramPostBatchPost;
  channels: TelegramChannelSelectOption[];
  disabled?: boolean;
  onChange: (post: TelegramPostBatchPost) => void;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(true);
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(
    channels[0]?.id ?? null,
  );
  const visibleExpandedChannelId =
    expandedChannelId === null
      ? null
      : channels.some((channel) => channel.id === expandedChannelId)
        ? expandedChannelId
        : (channels[0]?.id ?? null);
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
  if (channels.length <= 1) return null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="mt-4 w-full justify-between"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {t("telegram.posts.batch.channelOverrides", {
            count: channels.length,
          })}
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </Button>
      {open ? (
        <div
          data-testid="post-batch-channel-overrides"
          className="mt-3 space-y-2"
        >
          {channels.map((channel) => {
            const override = post.channelOverrides.find(
              (item) => item.telegramChannelId === channel.id,
            );
            const action = override?.action ?? post.action;
            const scheduledAt = override?.scheduledAt ?? post.scheduledAt;
            return (
              <div
                key={channel.id}
                data-testid={`post-batch-channel-${channel.id}`}
                className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-label={t(
                      "telegram.posts.batch.toggleChannelSchedule",
                      {
                        channel: channel.title,
                      },
                    )}
                    aria-expanded={visibleExpandedChannelId === channel.id}
                    disabled={disabled || action !== "SCHEDULE"}
                    onClick={() =>
                      setExpandedChannelId(
                        visibleExpandedChannelId === channel.id
                          ? null
                          : channel.id,
                      )
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                  >
                    <IconAvatar
                      icon={
                        channel.photoUrl
                          ? {
                              type: "image",
                              id: channel.id,
                              url: channel.photoUrl,
                              name: channel.title,
                            }
                          : null
                      }
                      label={channel.title}
                      size="sm"
                    />
                    <span className="truncate text-sm font-medium text-neutral-200">
                      {channel.title}
                    </span>
                    {action === "SCHEDULE" && scheduledAt ? (
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-neutral-400">
                        {formatDateTime(scheduledAt, locale)}
                      </span>
                    ) : null}
                    {action === "SCHEDULE" ? (
                      visibleExpandedChannelId === channel.id ? (
                        <ChevronDown size={15} className="shrink-0" />
                      ) : (
                        <ChevronRight size={15} className="shrink-0" />
                      )
                    ) : null}
                  </button>
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
                  value={action}
                  disabled={disabled}
                  searchable={false}
                  options={[...actionOptions]}
                  onChange={(value) =>
                    onChange({
                      ...post,
                      channelOverrides:
                        value === post.action
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
                {action === "SCHEDULE" &&
                visibleExpandedChannelId === channel.id ? (
                  <div className="mt-2">
                    <ChannelOverrideSchedule
                      channelId={channel.id}
                      scheduledAt={scheduledAt}
                      disabled={disabled}
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
    </>
  );
}
