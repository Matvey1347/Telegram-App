"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";
import { DateInput, FormField, TimeInput } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

const dateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const occurrenceDateKey = (scheduledAt: string, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(scheduledAt));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export function PublicationSlotOccurrenceSelect({
  channelId,
  value,
  scheduledAt,
  disabled = false,
  onChange,
}: {
  channelId: string;
  value: string | null;
  scheduledAt?: string | null;
  disabled?: boolean;
  onChange: (value: { slotId: string | null; scheduledAt: string }) => void;
}) {
  const { t } = useI18n();
  const initial = scheduledAt ? new Date(scheduledAt) : new Date();
  const [selectedDate, setSelectedDate] = useState(() => dateKey(initial));
  const [customTime, setCustomTime] = useState(() =>
    scheduledAt
      ? `${String(initial.getHours()).padStart(2, "0")}:${String(initial.getMinutes()).padStart(2, "0")}`
      : "",
  );
  const [range] = useState(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    return {
      from: from.toISOString(),
      to: new Date(from.getTime() + 62 * 86400000).toISOString(),
    };
  });
  const occurrences = useQuery({
    queryKey: telegramPublicationScheduleKeys.occurrences(channelId, range),
    queryFn: () => telegramPublicationSchedulesApi.occurrences(channelId, range),
    enabled: !disabled,
  });
  const dayOccurrences = useMemo(
    () =>
      (occurrences.data ?? []).filter(
        (item) => occurrenceDateKey(item.scheduledAt, item.timezone) === selectedDate,
      ),
    [occurrences.data, selectedDate],
  );
  const applyCustomTime = (time: string) => {
    setCustomTime(time);
    if (!time) return;
    const candidate = new Date(`${selectedDate}T${time}:00`);
    if (!Number.isNaN(candidate.getTime())) {
      onChange({ slotId: null, scheduledAt: candidate.toISOString() });
    }
  };

  return (
    <FormField label={t("telegram.posts.schedules.chooseSlot")} required>
      <div className="space-y-3">
        <DateInput
          value={selectedDate}
          min={dateKey(new Date())}
          disabled={disabled}
          onChange={(event) => {
            setSelectedDate(event.target.value);
            setCustomTime("");
          }}
        />
        {occurrences.isLoading ? <p className="text-sm text-neutral-400">{t("telegram.posts.schedules.loadingOccurrences")}</p> : null}
        {occurrences.isError ? <p className="text-sm text-rose-300">{t("telegram.posts.schedules.occurrencesError")}</p> : null}
        {!occurrences.isLoading && !occurrences.isError ? (
          <div className="flex flex-wrap gap-2">
            {dayOccurrences.map((item) => {
              const key = `${item.slotId}:${item.scheduledAt}`;
              const optionDisabled = disabled || (item.state !== "AVAILABLE" && key !== value);
              const kindLabel = item.kind === "AD" ? "📣 Advertising / mutual promotion" : "📝 Regular publication";
              const stateLabel = item.state === "OCCUPIED"
                ? `${t("telegram.posts.schedules.occupied")}${item.postTitle ? `: ${item.postTitle}` : ""}`
                : item.state === "PAST"
                  ? t("telegram.posts.schedules.past")
                  : t("telegram.posts.schedules.available");
              const accessibleLabel = `${item.time} · ${kindLabel} · ${item.title} · ${stateLabel}`;
              return (
                <button
                  type="button"
                  key={key}
                  disabled={optionDisabled}
                  aria-label={accessibleLabel}
                  title={accessibleLabel}
                  onClick={() => {
                    setCustomTime(item.time);
                    onChange({ slotId: item.slotId, scheduledAt: item.scheduledAt });
                  }}
                  className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${key === value ? "border-blue-500 bg-blue-950/40 text-white" : optionDisabled ? "cursor-not-allowed border-neutral-800 bg-neutral-950/40 text-neutral-500 opacity-45" : "border-neutral-700 bg-neutral-950 text-neutral-200 hover:border-blue-600"}`}
                >
                  <span>{item.time}</span>
                  <span aria-hidden="true">·</span>
                  <span aria-hidden="true">{item.kind === "AD" ? "📣" : "📝"}</span>
                </button>
              );
            })}
            {!dayOccurrences.length ? <p className="text-sm text-neutral-500">{t("telegram.posts.schedules.noSlotsForDate")}</p> : null}
          </div>
        ) : null}
        <div className="rounded-lg border border-dashed border-neutral-700 p-3">
          <p className="mb-2 text-sm font-medium text-neutral-200">{t("telegram.posts.schedules.customTime")}</p>
          <TimeInput disabled={disabled} value={customTime} onChange={(event) => applyCustomTime(event.target.value)} />
          <p className="mt-1 text-xs text-neutral-500">{t("telegram.posts.schedules.customTimeHint")}</p>
        </div>
      </div>
    </FormField>
  );
}
