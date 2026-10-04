"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
} from "lucide-react";
import type { TelegramPublicationPlanCalendarEvent } from "@telegram-system/shared";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  Button,
  CustomSelect,
  DateRangeInput,
  EmptyState,
  LoadingState,
  Modal,
  PageHeader,
} from "@/components/ui/primitives";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";
import { zonedDateTimeToUtc } from "@/lib/features/growth/telegram-ad-sales";
import { useWorkspaceTimezone } from "@/hooks/use-workspace-timezone";
import { PublicationCalendarEventEditor } from "./publication-calendar-event-editor";

type CalendarView = "week" | "month" | "threeWeeks";
type SlotRow = {
  slotId: string;
  scheduledAt: string;
  title: string;
  time: string;
};

const views: Array<{
  id: CalendarView;
  label: string;
  Icon: typeof CalendarRange;
}> = [
  { id: "week", label: "Week", Icon: CalendarRange },
  { id: "month", label: "Month", Icon: CalendarDays },
  { id: "threeWeeks", label: "3 weeks", Icon: CalendarDays },
];

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() - ((next.getDay() || 7) - 1));
  next.setHours(0, 0, 0, 0);
  return next;
}
function rangeFor(view: CalendarView, cursor: Date) {
  if (view === "month")
    return {
      from: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
      to: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59),
    };
  const from = startOfWeek(cursor);
  return { from, to: addDays(from, view === "threeWeeks" ? 20 : 6) };
}
function monthGridDays(cursor: Date) {
  return Array.from({ length: 42 }, (_, index) =>
    addDays(
      startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1)),
      index,
    ),
  );
}
function calendarDayKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function dateKey(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function displayTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
function minuteKey(value: string) {
  return new Date(value).toISOString().slice(0, 16);
}
function secondaryButton(active = false) {
  return active
    ? "border-blue-500 bg-blue-600 text-white"
    : "border-neutral-700 bg-neutral-950 text-neutral-300 hover:border-neutral-500 hover:text-white";
}

function eventTone(event: TelegramPublicationPlanCalendarEvent) {
  return event.kind === "AD"
    ? "border-emerald-700/80 bg-emerald-950/30 text-emerald-50 hover:border-emerald-500"
    : "border-violet-700/80 bg-violet-950/30 text-violet-50 hover:border-violet-500";
}

function relevantEvents(events: TelegramPublicationPlanCalendarEvent[]) {
  const unique = new Map<string, TelegramPublicationPlanCalendarEvent>();
  for (const event of events)
    if (event.kind !== "CONTENT")
      unique.set(`${event.kind}:${event.title}`, event);
  return [...unique.values()];
}

function EventMarker({
  event,
}: {
  event: TelegramPublicationPlanCalendarEvent;
}) {
  const label = event.kind === "AD" ? "Advertising" : "VP";
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-neutral-200">
      {event.avatarUrl ? (
        <TelegramEntityAvatar
          imageUrl={event.avatarUrl}
          kind="person"
          alt={label}
          size="xs"
        />
      ) : (
        <IconAvatar icon={event.avatarPresentation} label={label} size="xs" />
      )}
      <span>{event.kind === "AD" ? "Ad" : "VP"}</span>
    </span>
  );
}

export function PublicationPlanCalendarPage() {
  const timezone = useWorkspaceTimezone();
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [scheduleId, setScheduleId] = useState("");
  const [conflictEvents, setConflictEvents] = useState<
    TelegramPublicationPlanCalendarEvent[]
  >([]);
  const [editorEvent, setEditorEvent] =
    useState<TelegramPublicationPlanCalendarEvent | null>(null);
  const schedulesQuery = useQuery({
    queryKey: telegramPublicationScheduleKeys.lists(timezone),
    queryFn: telegramPublicationSchedulesApi.list,
    staleTime: 5 * 60 * 1000,
  });
  const defaultScheduleId = useMemo(() => {
    const schedule = [...(schedulesQuery.data ?? [])].sort(
      (left, right) =>
        Number(right.isDefault) - Number(left.isDefault) ||
        right.assignedChannelsCount - left.assignedChannelsCount,
    )[0];
    return schedule?.id ?? "";
  }, [schedulesQuery.data]);
  const selectedScheduleId = scheduleId || defaultScheduleId;
  const range = useMemo(() => rangeFor(view, cursor), [cursor, view]);
  const requestRange = useMemo(() => {
    const visibleDays = view === "month" ? monthGridDays(cursor) : null;
    const from = visibleDays?.[0] ?? range.from;
    const to = visibleDays?.at(-1) ?? range.to;
    return {
      from: zonedDateTimeToUtc(
        calendarDayKey(from),
        "00:00",
        timezone,
      ).toISOString(),
      to: zonedDateTimeToUtc(
        calendarDayKey(addDays(to, 1)),
        "00:00",
        timezone,
      ).toISOString(),
    };
  }, [cursor, range, timezone, view]);
  const calendarQuery = useQuery({
    queryKey: telegramPublicationScheduleKeys.calendar(
      selectedScheduleId,
      requestRange,
    ),
    queryFn: () =>
      telegramPublicationSchedulesApi.calendar(
        selectedScheduleId,
        requestRange,
      ),
    enabled: Boolean(selectedScheduleId),
    staleTime: 30 * 1000,
  });
  const selected = schedulesQuery.data?.find(
    (schedule) => schedule.id === selectedScheduleId,
  );
  const days = useMemo(
    () =>
      view === "month"
        ? monthGridDays(cursor)
        : Array.from({ length: view === "threeWeeks" ? 21 : 7 }, (_, index) =>
            addDays(range.from, index),
          ),
    [cursor, range.from, view],
  );
  const slotRows = useMemo(() => {
    const rows = new Map<string, SlotRow>();
    for (const occurrence of Object.values(
      calendarQuery.data?.occurrencesByChannel ?? {},
    ).flat()) {
      if (occurrence.kind !== "AD") continue;
      rows.set(`${occurrence.slotId}:${occurrence.scheduledAt}`, {
        slotId: occurrence.slotId,
        scheduledAt: occurrence.scheduledAt,
        title: occurrence.title,
        time: occurrence.time,
      });
    }
    return [...rows.values()];
  }, [calendarQuery.data?.occurrencesByChannel]);
  const eventsByMoment = useMemo(() => {
    const grouped = new Map<string, TelegramPublicationPlanCalendarEvent[]>();
    for (const event of calendarQuery.data?.events ?? []) {
      if (event.kind === "CONTENT") continue;
      const key = `${event.slotId ?? "time"}:${minuteKey(event.scheduledAt)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return grouped;
  }, [calendarQuery.data?.events]);
  const eventsForSlot = (slot: SlotRow) =>
    relevantEvents([
      ...(eventsByMoment.get(`${slot.slotId}:${minuteKey(slot.scheduledAt)}`) ??
        []),
      ...(eventsByMoment.get(`time:${minuteKey(slot.scheduledAt)}`) ?? []),
    ]);
  const openEvent = (event: TelegramPublicationPlanCalendarEvent) => {
    setConflictEvents([]);
    setEditorEvent(event);
  };
  const shift = (direction: -1 | 1) =>
    setCursor((current) =>
      addDays(
        current,
        direction * (view === "month" ? 30 : view === "threeWeeks" ? 21 : 7),
      ),
    );
  const today = dateKey(new Date().toISOString(), timezone);

  return (
    <AppShell>
      <PageTabHead title="Publication calendar" emoji="🗓️" color="#2563eb" />
      <PageHeader
        title="Publication calendar"
        subtitle="See advertising and VP occupancy in the selected publication plan."
      />
      <section className="mb-5 overflow-hidden rounded-[18px] border border-neutral-800 bg-[#111111]">
        <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {views.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm transition ${secondaryButton(view === id)}`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
            <div className="min-w-64">
              <CustomSelect
                value={selectedScheduleId}
                onChange={setScheduleId}
                placeholder="Choose publication plan"
                options={(schedulesQuery.data ?? []).map((schedule) => ({
                  value: schedule.id,
                  label: schedule.name,
                  iconPresentation: schedule.iconPresentation ?? undefined,
                  iconFallback: "🗓️",
                }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous calendar period"
                onClick={() => shift(-1)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${secondaryButton()}`}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setCursor(new Date())}
                className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-medium ${secondaryButton()}`}
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next calendar period"
                onClick={() => shift(1)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${secondaryButton()}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <DateRangeInput
              from={calendarDayKey(range.from)}
              to={calendarDayKey(range.to)}
              onChange={({ from }) => {
                if (from) setCursor(new Date(`${from}T12:00:00`));
              }}
              className="w-full sm:w-[320px]"
            />
          </div>
        </div>
      </section>
      {schedulesQuery.isLoading || (scheduleId && calendarQuery.isLoading) ? (
        <LoadingState text="Loading publication occupancy…" />
      ) : null}
      {!schedulesQuery.isLoading && !schedulesQuery.data?.length ? (
        <EmptyState text="No publication plans yet. Create and assign a publication plan to see its occupancy calendar." />
      ) : null}
      {calendarQuery.isError ? (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-100">
          Could not load plan occupancy. Try changing the period or reload the
          page.
        </div>
      ) : null}
      {selected && !calendarQuery.isLoading ? (
        <section className="rounded-[22px] border border-neutral-800 bg-[#171717]">
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 border-b border-slate-800/80 bg-[#09111e]">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                  (label) => (
                    <div
                      key={label}
                      className="border-r border-slate-800/80 px-3 py-2 text-center text-xs font-medium text-neutral-400 last:border-r-0"
                    >
                      {label}
                    </div>
                  ),
                )}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const dayKey = calendarDayKey(day);
                  const outsideMonth =
                    view === "month" && day.getMonth() !== cursor.getMonth();
                  const rows = slotRows
                    .filter(
                      (slot) => dateKey(slot.scheduledAt, timezone) === dayKey,
                    )
                    .sort((left, right) =>
                      left.scheduledAt.localeCompare(right.scheduledAt),
                    );
                  const plannedTimes = new Set(
                    rows.map((row) => minuteKey(row.scheduledAt)),
                  );
                  const outside = relevantEvents(
                    (calendarQuery.data?.events ?? []).filter(
                      (event) =>
                        dateKey(event.scheduledAt, timezone) === dayKey &&
                        !plannedTimes.has(minuteKey(event.scheduledAt)),
                    ),
                  );
                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-[118px] border-b border-r border-slate-900/70 p-1.5 ${outsideMonth ? "bg-black/20" : "bg-[#111111]"}`}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white">
                          {day.getDate()}
                        </span>
                        {dayKey === today ? (
                          <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            Today
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        {[
                          ...rows.map((slot) => ({
                            type: "slot" as const,
                            scheduledAt: slot.scheduledAt,
                            slot,
                          })),
                          ...outside.map((event) => ({
                            type: "outside" as const,
                            scheduledAt: event.scheduledAt,
                            event,
                          })),
                        ]
                          .sort((left, right) =>
                            left.scheduledAt.localeCompare(right.scheduledAt),
                          )
                          .map((entry) => {
                            if (entry.type === "outside") {
                              const { event } = entry;
                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => openEvent(event)}
                                  className={`flex w-full items-center gap-1.5 rounded-md border border-dashed px-1.5 py-1 text-left text-[10px] font-medium ${eventTone(event)}`}
                                >
                                  <span className="shrink-0">
                                    {displayTime(event.scheduledAt, timezone)}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">
                                    {event.title}
                                  </span>
                                  <EventMarker event={event} />
                                </button>
                              );
                            }
                            const { slot } = entry;
                            const events = eventsForSlot(slot);
                            const conflict = events.length > 1;
                            return (
                              <button
                                key={`${slot.slotId}:${slot.scheduledAt}`}
                                type="button"
                                disabled={!events.length}
                                onClick={() => {
                                  if (conflict) setConflictEvents(events);
                                  else if (events[0]) openEvent(events[0]);
                                }}
                                className={`flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-[10px] font-medium ${conflict ? "border-rose-700 bg-rose-950/30 text-rose-100" : events.length ? eventTone(events[0]) : "border-neutral-800 bg-neutral-950/70 text-neutral-400"}`}
                              >
                                <span className="shrink-0">{slot.time}</span>
                                <span className="min-w-0 flex-1 truncate">
                                  {events.length === 1
                                    ? events[0].title
                                    : "Ad slot"}
                                </span>
                                {events.length ? (
                                  <EventMarker event={events[0]} />
                                ) : (
                                  <span className="text-neutral-600">—</span>
                                )}
                                {conflict ? <TriangleAlert size={11} /> : null}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}
      <Modal
        open={conflictEvents.length > 0}
        onClose={() => setConflictEvents([])}
        title="Slot conflict"
        size="sm"
      >
        <p className="text-sm text-neutral-300">
          More than one publication is booked for this slot. Open one to
          reschedule it.
        </p>
        <div className="mt-4 space-y-2">
          {conflictEvents.map((event) => (
            <Button
              key={event.id}
              type="button"
              variant="secondary"
              className="flex w-full items-center justify-between gap-3"
              onClick={() => openEvent(event)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <EventMarker event={event} />
                <span className="truncate">{event.title}</span>
              </span>
              <span className="shrink-0 text-xs text-neutral-400">
                {displayTime(event.scheduledAt, timezone)}
              </span>
            </Button>
          ))}
        </div>
      </Modal>
      <PublicationCalendarEventEditor
        event={editorEvent}
        onClose={() => setEditorEvent(null)}
      />
    </AppShell>
  );
}
