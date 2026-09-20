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
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

type PublicationSlotOccurrenceSelectProps = {
  channelId: string;
  value: string | null;
  scheduledAt?: string | null;
  disabled?: boolean;
  onChange: (value: { slotId: string | null; scheduledAt: string }) => void;
};

export function PublicationSlotOccurrenceSelect(
  props: PublicationSlotOccurrenceSelectProps,
) {
  return (
    <PublicationSlotOccurrenceSelectState
      key={`${props.channelId}:${props.scheduledAt ?? ""}`}
      {...props}
    />
  );
}

function PublicationSlotOccurrenceSelectState({
  channelId,
  value,
  scheduledAt,
  disabled = false,
  onChange,
}: PublicationSlotOccurrenceSelectProps) {
  const { t } = useI18n();
  const initial = scheduledAt ? new Date(scheduledAt) : new Date();
  const [selectedDate, setSelectedDate] = useState(() => dateKey(initial));
  const [publicationTime, setPublicationTime] = useState(() =>
    scheduledAt
      ? `${String(initial.getHours()).padStart(2, "0")}:${String(initial.getMinutes()).padStart(2, "0")}`
      : "",
  );
  const applyPublicationTime = (time: string) => {
    setPublicationTime(time);
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
            setPublicationTime("");
          }}
        />
        <div>
          <p className="mb-2 text-sm font-medium text-neutral-200">
            Publication time
          </p>
          <TimeInput
            disabled={disabled}
            value={publicationTime}
            onChange={(event) => applyPublicationTime(event.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-500">
            Choose any future time, or select a slot below to fill it automatically.
          </p>
        </div>
        <PublicationSlotOptions
          channelId={channelId}
          selectedDate={selectedDate}
          value={value}
          scheduledAt={scheduledAt}
          disabled={disabled}
          onChange={(next) => {
            setPublicationTime(next.time);
            onChange(next);
          }}
        />
      </div>
    </FormField>
  );
}

export function PublicationSlotOptions({
  channelId,
  selectedDate,
  value,
  scheduledAt,
  disabled = false,
  onChange,
}: {
  channelId: string;
  selectedDate: string;
  value: string | null;
  scheduledAt?: string | null;
  disabled?: boolean;
  onChange: (value: {
    slotId: string;
    scheduledAt: string;
    time: string;
  }) => void;
}) {
  const { t } = useI18n();
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
    queryFn: () =>
      telegramPublicationSchedulesApi.occurrences(channelId, range),
    enabled: !disabled,
  });
  const dayOccurrences = useMemo(
    () =>
      (occurrences.data ?? []).filter(
        (item) =>
          occurrenceDateKey(item.scheduledAt, item.timezone) === selectedDate,
      ),
    [occurrences.data, selectedDate],
  );
  const separatorIndex = value?.indexOf(":") ?? -1;
  const selectedSlotId =
    separatorIndex > 0 ? value!.slice(0, separatorIndex) : null;
  const selectedValueTime =
    separatorIndex > 0 ? value!.slice(separatorIndex + 1) : null;
  const selectedInstant = scheduledAt ?? selectedValueTime;
  const selectedValue =
    dayOccurrences
      .filter(
        (item) =>
          (!selectedSlotId || item.slotId === selectedSlotId) &&
          selectedInstant &&
          new Date(item.scheduledAt).getTime() ===
            new Date(selectedInstant).getTime(),
      )
      .map((item) => `${item.slotId}:${item.scheduledAt}`)[0] ?? null;

  if (occurrences.isLoading) {
    return (
      <p className="text-sm text-neutral-400">
        {t("telegram.posts.schedules.loadingOccurrences")}
      </p>
    );
  }
  if (occurrences.isError) {
    return (
      <p className="text-sm text-rose-300">
        {t("telegram.posts.schedules.occurrencesError")}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {dayOccurrences.map((item) => {
        const key = `${item.slotId}:${item.scheduledAt}`;
        const isSelected = key === selectedValue;
        const isAvailable = item.state === "AVAILABLE";
        const optionDisabled =
          disabled || (!isAvailable && !isSelected);
        const kindLabel =
          item.kind === "AD"
            ? "📣 Advertising / mutual promotion"
            : "📝 Regular publication";
        const stateLabel =
          item.state === "OCCUPIED"
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
            aria-pressed={isSelected}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            onClick={() =>
              onChange({
                slotId: item.slotId,
                scheduledAt: item.scheduledAt,
                time: item.time,
              })
            }
            className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${isSelected ? "border-blue-500 bg-blue-950/70 text-white ring-1 ring-blue-500/60" : item.state === "AVAILABLE" ? "border-neutral-600 bg-neutral-900 text-neutral-200 hover:border-blue-700 hover:bg-blue-950/30 hover:text-white" : item.state === "OCCUPIED" ? "cursor-not-allowed border-amber-900/70 bg-amber-950/20 text-amber-400/70" : "cursor-not-allowed border-neutral-900 bg-neutral-950/50 text-neutral-600 line-through"}`}
          >
            <span>{item.time}</span>
            <span aria-hidden="true">·</span>
            <span aria-hidden="true">{item.kind === "AD" ? "📣" : "📝"}</span>
            {!isSelected && item.state === "OCCUPIED" ? (
              <span aria-hidden="true">🔒</span>
            ) : null}
            {!isSelected && item.state === "PAST" ? (
              <span aria-hidden="true">⌛</span>
            ) : null}
          </button>
        );
      })}
      {!dayOccurrences.length ? (
        <p className="text-sm text-neutral-500">
          {t("telegram.posts.schedules.noSlotsForDate")}
        </p>
      ) : null}
    </div>
  );
}
