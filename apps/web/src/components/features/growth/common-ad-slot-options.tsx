"use client";

import { type ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TelegramPublicationSlotOccurrence } from "@telegram-system/shared";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";

type SlotState = "AVAILABLE" | "OCCUPIED" | "PAST" | "UNAVAILABLE";
type SlotOption = { time: string; state: SlotState; detail: string };

function localDate(scheduledAt: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(scheduledAt));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function commonAdSlotOptions(
  channelIds: string[],
  date: string,
  byChannel: Record<string, TelegramPublicationSlotOccurrence[]>,
): SlotOption[] {
  if (!channelIds.length) return [];
  const perChannel = channelIds.map((id) =>
    (byChannel[id] ?? []).filter(
      (item) =>
        item.kind === "AD" &&
        localDate(item.scheduledAt, item.timezone) === date,
    ),
  );
  const times = [
    ...new Set(perChannel.flatMap((items) => items.map((item) => item.time))),
  ].sort();
  return times.map((time) => {
    const matching = perChannel.map((items) =>
      items.filter((item) => item.time === time),
    );
    const missing = matching.filter((items) => !items.length).length;
    const occupied = matching.flat().find((item) => item.state === "OCCUPIED");
    const past = matching.flat().some((item) => item.state === "PAST");
    const state: SlotState = missing
      ? "UNAVAILABLE"
      : occupied
        ? "OCCUPIED"
        : past
          ? "PAST"
          : "AVAILABLE";
    return {
      time,
      state,
      detail: missing
        ? `Missing in ${missing} of ${channelIds.length} channels`
        : occupied
          ? occupied.postTitle
            ? `Occupied: ${occupied.postTitle}`
            : "Occupied"
          : past
            ? "Past"
            : "Available in all channels",
    };
  });
}

export function commonAdSlotOptionsForDates(
  channelIds: string[],
  dates: string[],
  byChannel: Record<string, TelegramPublicationSlotOccurrence[]>,
): SlotOption[] {
  const uniqueDates = [...new Set(dates)].sort();
  if (!channelIds.length || !uniqueDates.length) return [];
  const perDate = uniqueDates.map((date) =>
    commonAdSlotOptions(channelIds, date, byChannel).filter(
      (option) => option.state === "AVAILABLE",
    ),
  );
  const sharedTimes = perDate.length
    ? perDate[0]!.filter((option) =>
        perDate.every((options) => options.some((candidate) => candidate.time === option.time)),
      )
    : [];
  return sharedTimes.map((option) => ({
    ...option,
    detail: "Available in all channels and selected dates",
  }));
}

function dayRange(date: string) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00.000Z`).getTime()
    : 0;
  const safeStart = Number.isFinite(start) ? start : 0;
  return {
    from: new Date(safeStart - 86400000).toISOString(),
    to: new Date(safeStart + 2 * 86400000).toISOString(),
  };
}

function dateRange(dates: string[]) {
  const sorted = [...new Set(dates)].sort();
  if (!sorted.length) return dayRange("");
  const first = dayRange(sorted[0]!);
  const last = dayRange(sorted.at(-1)!);
  return { from: first.from, to: last.to };
}

export function CommonAdSlotOptions({
  channelIds,
  date,
  dates,
  selectedTime,
  onSelect,
  occurrencesByChannel,
  loading = false,
  action,
  hideHeading = false,
}: {
  channelIds: string[];
  date?: string;
  dates?: string[];
  selectedTime: string;
  onSelect: (time: string) => void;
  /** Lets a multi-channel editor reuse one availability query for its rows. */
  occurrencesByChannel?: Record<string, TelegramPublicationSlotOccurrence[]>;
  loading?: boolean;
  action?: ReactNode;
  hideHeading?: boolean;
}) {
  const ids = useMemo(() => [...new Set(channelIds)].sort(), [channelIds]);
  const selectedDates = useMemo(
    () => [...new Set(dates ?? (date ? [date] : []))].sort(),
    [date, dates],
  );
  const range = useMemo(() => dateRange(selectedDates), [selectedDates]);
  const isSharedDates = selectedDates.length > 1;
  const query = useQuery({
    queryKey: telegramPublicationScheduleKeys.occurrencesByChannels(ids, range),
    queryFn: () =>
      telegramPublicationSchedulesApi.occurrencesByChannels(ids, range),
    enabled:
      occurrencesByChannel === undefined && !loading &&
      ids.length > 0 &&
      selectedDates.length > 0 && selectedDates.every((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
    staleTime: 60_000,
  });
  const options = useMemo(
    () => isSharedDates
      ? commonAdSlotOptionsForDates(ids, selectedDates, occurrencesByChannel ?? query.data ?? {})
      : commonAdSlotOptions(ids, selectedDates[0] ?? "", occurrencesByChannel ?? query.data ?? {}),
    [ids, isSharedDates, selectedDates, occurrencesByChannel, query.data],
  );
  const availableOptions = options.filter(
    (option) => option.state === "AVAILABLE",
  );
  if (!ids.length || !selectedDates.length) return null;
  return (
    <div className="space-y-2">
      {!hideHeading || action ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!hideHeading ? (
            <p className="text-xs text-neutral-500">{isSharedDates ? "Common advertising slots · all selected dates" : `Advertising slots · ${selectedDates[0]}`}</p>
          ) : null}
          {action}
        </div>
      ) : null}
      {loading || (occurrencesByChannel === undefined && query.isPending) ? (
        <p className="text-xs text-neutral-400">Loading slots…</p>
      ) : null}
      {occurrencesByChannel === undefined && query.isError ? (
        <p role="alert" className="text-xs text-rose-300">
          Could not load slots.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </p>
      ) : null}
      {occurrencesByChannel !== undefined || query.isSuccess ? (
        availableOptions.length ? (
          <div className="flex flex-wrap gap-2">
            {availableOptions.map((option) => {
              const selected = option.time === selectedTime;
              const label = `${option.time} · Advertising / mutual promotion · ${option.detail}`;
              return (
                <button
                  key={option.time}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={selected}
                  onClick={() => onSelect(option.time)}
                  className={`min-h-8 rounded-md border px-2 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-blue-500 ${selected ? "border-blue-500 bg-blue-950/70 text-white ring-1 ring-blue-500/60" : "border-neutral-600 bg-neutral-900 text-neutral-200 hover:border-blue-700 hover:bg-blue-950/30"}`}
                >
                  {option.time} · 📣
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">
            {isSharedDates
              ? "No advertising slots are available on every selected date."
              : "No available advertising slots for this date."}
          </p>
        )
      ) : null}
    </div>
  );
}
