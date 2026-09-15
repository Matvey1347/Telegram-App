"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  TelegramChannelPublicationScheduleAssignment,
  TelegramPublicationSchedule,
} from "@telegram-system/shared";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";
import { CustomSelect, FormField } from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";

export type ChannelPublicationScheduleDraft = {
  scheduleId: string;
  selectedSlotIds: string[];
};

export function ChannelPublicationScheduleSettings({
  channelId,
  value,
  onChange,
}: {
  channelId: string;
  value?: ChannelPublicationScheduleDraft | null;
  onChange?: (value: ChannelPublicationScheduleDraft) => void;
}) {
  const schedules = useQuery({
    queryKey: telegramPublicationScheduleKeys.lists(),
    queryFn: telegramPublicationSchedulesApi.list,
  });
  const assignment = useQuery({
    queryKey: telegramPublicationScheduleKeys.assignment(channelId),
    queryFn: () => telegramPublicationSchedulesApi.getAssignment(channelId),
  });
  if (schedules.isLoading || assignment.isLoading)
    return (
      <p className="text-sm text-neutral-400">Loading publication schedule…</p>
    );
  if (schedules.isError || assignment.isError)
    return (
      <p className="text-sm text-rose-300">
        Could not load publication schedules.
      </p>
    );
  if (!schedules.data?.length)
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-5 text-sm text-neutral-400">
        Create a workspace publication schedule from the Channels page first.
      </div>
    );
  return (
    <ChannelPublicationScheduleForm
      key={assignment.data?.updatedAt ?? "unassigned"}
      schedules={schedules.data}
      assignment={assignment.data ?? null}
      value={value}
      onChange={onChange}
    />
  );
}

function ChannelPublicationScheduleForm({
  schedules,
  assignment,
  value,
  onChange,
}: {
  schedules: TelegramPublicationSchedule[];
  assignment: TelegramChannelPublicationScheduleAssignment | null;
  value?: ChannelPublicationScheduleDraft | null;
  onChange?: (value: ChannelPublicationScheduleDraft) => void;
}) {
  const initialValue = {
    scheduleId: assignment?.scheduleId ?? "",
    selectedSlotIds:
      assignment?.selectionMode === "FULL"
        ? (assignment.schedule.slots.map((slot) => slot.id) ?? [])
        : (assignment?.selectedSlotIds ?? []),
  };
  const [localValue, setLocalValue] = useState(initialValue);
  const resolvedValue = value ?? localValue;
  const scheduleId = resolvedValue.scheduleId;
  const selectedSlotIds = resolvedValue.selectedSlotIds;
  const update = (next: ChannelPublicationScheduleDraft) => {
    setLocalValue(next);
    onChange?.(next);
  };
  const selectedSchedule = schedules.find(
    (schedule) => schedule.id === scheduleId,
  );
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-neutral-100">
          Channel publication plan
        </h3>
        <p className="text-sm text-neutral-400">
          Choose a workspace plan, then select the slots used by this channel.
        </p>
      </div>
      <div>
        <FormField label="Schedule">
          <CustomSelect
            value={scheduleId}
            placeholder="Select schedule"
            searchable={false}
            options={schedules.map((schedule) => ({
              value: schedule.id,
              label: schedule.name,
              iconPresentation: schedule.iconPresentation ?? undefined,
              iconFallback: schedule.name,
            }))}
            onChange={(nextScheduleId) => {
              update({
                scheduleId: nextScheduleId,
                selectedSlotIds:
                  schedules
                    .find((schedule) => schedule.id === nextScheduleId)
                    ?.slots.map((slot) => slot.id) ?? [],
              });
            }}
          />
        </FormField>
      </div>
      {selectedSchedule ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-200">
            <IconAvatar
              icon={selectedSchedule.iconPresentation}
              label={selectedSchedule.name}
              size="xs"
              decorative
            />
            Select channel slots
          </legend>
          {selectedSchedule.slots.map((slot) => (
            <label
              key={slot.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedSlotIds.includes(slot.id)}
                onChange={(event) =>
                  update({
                    scheduleId,
                    selectedSlotIds: event.target.checked
                      ? [...selectedSlotIds, slot.id]
                      : selectedSlotIds.filter((id) => id !== slot.id),
                  })
                }
              />
              <span className="flex-1 text-neutral-200">{slot.title}</span>
              <span
                className={`rounded-md border px-2 py-1 text-xs ${
                  slot.kind === "AD"
                    ? "border-amber-900/70 bg-amber-950/25 text-amber-200"
                    : "border-sky-900/70 bg-sky-950/25 text-sky-200"
                }`}
              >
                {slot.kind === "AD"
                  ? "📣 Advertising / mutual promotion"
                  : "📝 Regular publication"}{" "}
                · {slot.time}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
