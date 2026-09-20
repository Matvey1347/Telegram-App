"use client";

import { useMemo } from "react";
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

export function CommonAdSlotOptions({
  channelIds,
  date,
  selectedTime,
  onSelect,
}: {
  channelIds: string[];
  date: string;
  selectedTime: string;
  onSelect: (time: string) => void;
}) {
  const ids = useMemo(() => [...new Set(channelIds)].sort(), [channelIds]);
  const range = useMemo(() => dayRange(date), [date]);
  const query = useQuery({
    queryKey: telegramPublicationScheduleKeys.occurrencesByChannels(ids, range),
    queryFn: () =>
      telegramPublicationSchedulesApi.occurrencesByChannels(ids, range),
    enabled: ids.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 30_000,
  });
  const options = useMemo(
    () => commonAdSlotOptions(ids, date, query.data ?? {}),
    [ids, date, query.data],
  );
  if (!ids.length || !date) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-500">Advertising slots · {date}</p>
      {query.isPending ? (
        <p className="text-xs text-neutral-400">Loading slots…</p>
      ) : null}
      {query.isError ? (
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
      {query.isSuccess ? (
        options.length ? (
          <div className="flex flex-wrap gap-2">
            {options.map((option) => {
              const selected = option.time === selectedTime;
              const label = `${option.time} · Advertising / mutual promotion · ${option.detail}`;
              return (
                <button
                  key={option.time}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={selected}
                  disabled={option.state !== "AVAILABLE"}
                  onClick={() => onSelect(option.time)}
                  className={`min-h-8 rounded-md border px-2 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-blue-500 ${selected ? "border-blue-500 bg-blue-950/70 text-white ring-1 ring-blue-500/60" : option.state === "AVAILABLE" ? "border-neutral-600 bg-neutral-900 text-neutral-200 hover:border-blue-700 hover:bg-blue-950/30" : option.state === "OCCUPIED" ? "cursor-not-allowed border-amber-900/70 bg-amber-950/20 text-amber-400/70" : "cursor-not-allowed border-neutral-900 bg-neutral-950/50 text-neutral-500 line-through"}`}
                >
                  {option.time} · 📣{" "}
                  {option.state === "OCCUPIED"
                    ? "🔒"
                    : option.state === "PAST"
                      ? "⌛"
                      : option.state === "UNAVAILABLE"
                        ? "—"
                        : ""}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-neutral-500">
            No advertising slots for this date.
          </p>
        )
      ) : null}
    </div>
  );
}
