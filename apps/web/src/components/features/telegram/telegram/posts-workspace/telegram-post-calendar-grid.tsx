"use client";

import { Card, LoadingState } from "@/components/ui/primitives";
import {
  monthLabel,
  addMonths,
  startOfMonth,
  toLocalDateKey,
  calendarWeekdays,
  sameMonth,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import { formatDate } from "@/lib/date-format";
import { ChevronRight, RefreshCw, Layers3 } from "lucide-react";
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
>;

export function TelegramPostCalendarGrid({ model }: { model: Model }) {
  const {
    calendarMonth,
    locale,
    t,
    calendarData,
    setCalendarMonth,
    setSelectedCalendarDate,
    queryClient,
    channelId,
    setShowAdSalesOverlay,
    showAdSalesOverlay,
    calendarDays,
    calendarItemsByDay,
    adCalendarItemsByDay,
    selectedCalendarDate,
  } = model;
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            {monthLabel(calendarMonth, locale)}
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            {t("telegram.posts.calendar.scheduledThrough", {
              date: calendarData.data?.summary.lastScheduledAt
                ? formatDate(calendarData.data.summary.lastScheduledAt, locale)
                : t("telegram.posts.calendar.noScheduled"),
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setCalendarMonth((current) => addMonths(current, -1))
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
          >
            <ChevronRight size={16} className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => {
              const today = startOfMonth(new Date());
              setCalendarMonth(today);
              setSelectedCalendarDate(toLocalDateKey(new Date()));
            }}
            className="inline-flex h-10 items-center rounded-xl border border-neutral-800 bg-neutral-950 px-4 text-sm font-medium text-white transition hover:border-neutral-700 hover:bg-neutral-900"
          >
            {t("telegram.posts.calendar.today")}
          </button>
          <button
            type="button"
            onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["telegram-managed-posts-calendar", channelId],
              })
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
          >
            <RefreshCw size={15} />
            {t("common.refresh")}
          </button>
          <button
            type="button"
            onClick={() => setShowAdSalesOverlay((current) => !current)}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${
              showAdSalesOverlay
                ? "border-blue-700 bg-blue-950/40 text-blue-100"
                : "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900 hover:text-white"
            }`}
          >
            <Layers3 size={15} />
            {t("telegram.posts.calendar.adsOverlay")}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-[#1b1b1b]">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-neutral-800">
            {calendarWeekdays(locale).map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-[11px] font-medium text-neutral-400 sm:px-4 sm:py-3 sm:text-sm"
              >
                {day}
              </div>
            ))}
          </div>
          {calendarData.isLoading ? (
            <div className="p-8">
              <LoadingState />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {calendarDays.map((day) => {
                const dateKey = toLocalDateKey(day);
                const items = calendarItemsByDay.get(dateKey) || [];
                const scheduledCount = items.filter(
                  (item) => item.status === "SCHEDULED",
                ).length;
                const publishedCount = items.filter(
                  (item) => item.status === "PUBLISHED",
                ).length;
                const adItems = adCalendarItemsByDay.get(dateKey) || [];
                const adReservedCount = adItems.filter(
                  (item) => item.existingPlacement?.status === "RESERVED",
                ).length;
                const adSoldCount = adItems.filter(
                  (item) =>
                    item.existingPlacement?.status === "SCHEDULED" ||
                    item.existingPlacement?.status === "PUBLISHED" ||
                    item.existingPlacement?.status === "COMPLETED",
                ).length;
                const isCurrentMonth = sameMonth(day, calendarMonth);
                const isToday = dateKey === toLocalDateKey(new Date());
                const isSelected = dateKey === selectedCalendarDate;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => setSelectedCalendarDate(dateKey)}
                    className={`min-h-[56px] border-b border-r border-neutral-800 px-2 py-1 text-left align-top transition sm:min-h-[72px] sm:px-2 sm:py-1.5 ${
                      isSelected
                        ? "bg-[#262626]"
                        : "bg-[#1f1f1f] hover:bg-[#252525]"
                    }`}
                  >
                    <div className="flex h-full flex-col">
                      <div className="mb-1 flex items-start justify-between">
                        <span
                          className={`text-[1.3rem] font-semibold leading-none sm:text-[1.75rem] ${
                            isCurrentMonth ? "text-white" : "text-neutral-600"
                          }`}
                        >
                          {day.getDate()}
                        </span>
                        {isToday ? (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white sm:text-xs">
                            {t("telegram.posts.calendar.today")}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 space-y-1 sm:space-y-1.5">
                        {scheduledCount ? (
                          <div className="whitespace-nowrap text-[9px] font-medium text-amber-300 sm:text-[10px]">
                            {t("telegram.posts.calendar.scheduledShort", {
                              count: scheduledCount,
                            })}
                          </div>
                        ) : null}
                        {publishedCount ? (
                          <div className="whitespace-nowrap text-[9px] font-medium text-emerald-300 sm:text-[10px]">
                            {t("telegram.posts.calendar.publishedShort", {
                              count: publishedCount,
                            })}
                          </div>
                        ) : null}
                        {showAdSalesOverlay && adReservedCount ? (
                          <div className="text-[10px] font-medium text-amber-300 sm:text-[11px]">
                            {t("telegram.posts.calendar.adReserved", {
                              count: adReservedCount,
                            })}
                          </div>
                        ) : null}
                        {showAdSalesOverlay && adSoldCount ? (
                          <div className="text-[10px] font-medium text-sky-300 sm:text-[11px]">
                            {t("telegram.posts.calendar.adSold", {
                              count: adSoldCount,
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
