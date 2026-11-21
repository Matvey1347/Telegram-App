"use client";

import {
  type TelegramManagedPost,
  type TelegramChannelTimePost,
} from "@/lib/api";
import { type Dispatch, type SetStateAction } from "react";
import { useI18n } from "@/providers/i18n-provider";
import {
  localDateTimeInputToDate,
  isValidTimeInputValue,
  CustomSelect,
  TimeInput,
} from "@/components/ui/primitives";

export function CalendarPostTimePicker({
  post,
  selectedCalendarDate,
  availableCalendarScheduleSlots,
  calendarScheduleSlots,
  channelId,
  channelTimePosts,
  selectedPostIds,
  timeChoiceByPostId,
  customTimeByPostId,
  onTimeChoiceChange,
  onCustomTimeChange,
}: {
  post: TelegramManagedPost;
  selectedCalendarDate: string;
  availableCalendarScheduleSlots: Array<{
    id: string;
    title: string;
    time: string;
    iconId?: string | null;
    state: "available" | "occupied" | "past";
  }>;
  calendarScheduleSlots: Array<{
    time: string;
    state: "available" | "occupied" | "past";
  }>;
  channelId: string;
  channelTimePosts: TelegramChannelTimePost[];
  selectedPostIds: string[];
  timeChoiceByPostId: Record<string, string>;
  customTimeByPostId: Record<string, string>;
  onTimeChoiceChange: Dispatch<SetStateAction<Record<string, string>>>;
  onCustomTimeChange: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const { t } = useI18n();
  const selectedChoice = timeChoiceByPostId[post.id] || "";
  const customTime = customTimeByPostId[post.id] || "";
  const slotState = calendarScheduleSlots.find(
    (slot) => slot.time === customTime,
  )?.state;
  const duplicate =
    customTime &&
    Object.entries(customTimeByPostId).some(
      ([otherPostId, value]) =>
        otherPostId !== post.id &&
        selectedPostIds.includes(otherPostId) &&
        timeChoiceByPostId[otherPostId] === "custom" &&
        value === customTime,
    );
  const customDateTime = localDateTimeInputToDate(
    selectedCalendarDate,
    customTime,
  );
  const invalidPast = Boolean(
    customDateTime && customDateTime.getTime() <= Date.now(),
  );
  const invalidOccupied =
    customTime && (slotState === "occupied" || slotState === "past");
  const errorMessage =
    selectedChoice === "custom"
      ? !customTime
        ? t("telegram.posts.calendar.enterTime")
        : !isValidTimeInputValue(customTime)
          ? t("telegram.posts.calendar.useTimeFormat")
          : duplicate
            ? t("telegram.posts.calendar.duplicateTime")
            : invalidPast
              ? t("telegram.posts.calendar.futureTime")
              : invalidOccupied
                ? t("telegram.posts.calendar.unavailableTime")
                : ""
      : "";

  return (
    <>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <CustomSelect
          value={selectedChoice}
          onChange={(value) =>
            onTimeChoiceChange((current) => ({
              ...current,
              [post.id]: value,
            }))
          }
          dropdownDirection="up"
          placeholder={t("telegram.posts.groups.chooseSlot")}
          searchable={false}
          dropdownClassName="min-w-[280px] sm:min-w-[320px]"
          options={[
            ...availableCalendarScheduleSlots
              .filter((slot) => {
                if (selectedChoice === `slot:${slot.time}`) return true;
                return !Object.entries(timeChoiceByPostId).some(
                  ([otherPostId, value]) =>
                    otherPostId !== post.id && value === `slot:${slot.time}`,
                );
              })
              .map((slot) => ({
                value: `slot:${slot.time}`,
                label: `${slot.time}  ${slot.title}`.trim(),
                iconEmoji: (() => {
                  const presentation = channelTimePosts.find(
                    (item) => item.id === slot.id,
                  )?.iconPresentation;
                  return presentation?.type === "unicode"
                    ? presentation.value
                    : "•";
                })(),
                tone: "success" as const,
              })),
            {
              value: "custom",
              label: t("telegram.posts.calendar.customTime"),
              iconEmoji: "🕒",
              tone: "info" as const,
            },
          ]}
        />
        {selectedChoice === "custom" ? (
          <TimeInput
            className="col-span-2"
            value={customTime}
            onChange={(event) =>
              onCustomTimeChange((current) => ({
                ...current,
                [post.id]: event.target.value,
              }))
            }
          />
        ) : (
          <div className="col-span-2 flex h-9 items-center rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 text-xs text-neutral-500">
            {t("telegram.posts.calendar.slot")}
          </div>
        )}
      </div>
      {errorMessage ? (
        <div className="mt-2 text-xs text-rose-300">{errorMessage}</div>
      ) : null}
    </>
  );
}
