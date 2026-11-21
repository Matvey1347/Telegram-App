"use client";

import { TelegramPostCalendarGrid } from "./telegram-post-calendar-grid";
import { TelegramPostCalendarDay } from "./telegram-post-calendar-day";
import type { TelegramPostWorkspaceModel } from "./use-telegram-post-workspace";

type Model = Pick<
  TelegramPostWorkspaceModel,
  | "calendarMonth"
  | "locale"
  | "t"
  | "calendarData"
  | "setCalendarMonth"
  | "setSelectedCalendarDate"
  | "queryClient"
  | "channelId"
  | "setShowAdSalesOverlay"
  | "showAdSalesOverlay"
  | "calendarDays"
  | "calendarItemsByDay"
  | "adCalendarItemsByDay"
  | "selectedCalendarDate"
  | "selectedCalendarDateLabel"
  | "workspaceTimezone"
  | "selectedCalendarItems"
  | "changePostView"
  | "posts"
  | "selectPost"
  | "onPostSelect"
  | "calendarPresetSlotByTime"
  | "channelTimePosts"
  | "selectedAdCalendarItems"
  | "calendarSchedulablePosts"
  | "calendarBatchSelectedPosts"
  | "calendarBatchBusy"
  | "clearCalendarBatchSelection"
  | "calendarPostSearch"
  | "setCalendarPostSearch"
  | "calendarFilteredSchedulablePosts"
  | "calendarGroupedSchedulablePosts"
  | "calendarBatchSelectedPostIds"
  | "openPostInNewTab"
  | "toggleCalendarBatchPostSelection"
  | "availableCalendarScheduleSlots"
  | "calendarScheduleSlots"
  | "calendarBatchTimeChoiceByPostId"
  | "calendarBatchCustomTimeByPostId"
  | "setCalendarBatchTimeChoiceByPostId"
  | "setCalendarBatchCustomTimeByPostId"
  | "calendarBatchPlan"
  | "calendarSchedulablePostsById"
  | "openPostWithModifier"
  | "scheduleCalendarBatch"
>;

export function TelegramPostCalendar({ model }: { model: Model }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.72fr)]">
      <TelegramPostCalendarGrid model={model} />
      <TelegramPostCalendarDay model={model} />
    </div>
  );
}
