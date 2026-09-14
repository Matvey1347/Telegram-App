"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  TelegramChannelPublicationScheduleAssignment,
  TelegramPublicationSchedule,
  TelegramPublicationScheduleSelectionMode,
} from "@telegram-system/shared";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";
import { Button, FormField, Select } from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { useAppToast } from "@/providers/toast-provider";

export function ChannelPublicationScheduleSettings({
  channelId,
}: {
  channelId: string;
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
      channelId={channelId}
      schedules={schedules.data}
      assignment={assignment.data ?? null}
    />
  );
}

function ChannelPublicationScheduleForm({
  channelId,
  schedules,
  assignment,
}: {
  channelId: string;
  schedules: TelegramPublicationSchedule[];
  assignment: TelegramChannelPublicationScheduleAssignment | null;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [scheduleId, setScheduleId] = useState(assignment?.scheduleId ?? "");
  const [mode, setMode] = useState<TelegramPublicationScheduleSelectionMode>(
    assignment?.selectionMode ?? "FULL",
  );
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>(
    assignment?.selectedSlotIds ?? [],
  );
  const selectedSchedule = schedules.find(
    (schedule) => schedule.id === scheduleId,
  );
  const save = useMutation({
    mutationFn: () =>
      telegramPublicationSchedulesApi.assign(channelId, {
        scheduleId,
        selectionMode: mode,
        selectedSlotIds: mode === "SUBSET" ? selectedSlotIds : [],
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(
        telegramPublicationScheduleKeys.assignment(channelId),
        next,
      );
      pushToast("Publication schedule assigned", "success");
    },
    onError: () => pushToast("Could not assign publication schedule", "error"),
  });
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-neutral-100">
          Channel publication plan
        </h3>
        <p className="text-sm text-neutral-400">
          Use every workspace slot, or select only the slots relevant to this
          channel.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Schedule">
          <Select
            value={scheduleId}
            onChange={(event) => {
              setScheduleId(event.target.value);
              const nextSchedule = schedules.find(
                (schedule) => schedule.id === event.target.value,
              );
              setSelectedSlotIds(
                mode === "SUBSET"
                  ? (nextSchedule?.slots.map((slot) => slot.id) ?? [])
                  : [],
              );
            }}
          >
            <option value="">Select schedule</option>
            {schedules.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Assignment">
          <Select
            value={mode}
            onChange={(event) => {
              const nextMode = event.target
                .value as TelegramPublicationScheduleSelectionMode;
              setMode(nextMode);
              if (nextMode === "SUBSET" && !selectedSlotIds.length) {
                setSelectedSlotIds(
                  selectedSchedule?.slots.map((slot) => slot.id) ?? [],
                );
              }
            }}
          >
            <option value="FULL">Full plan</option>
            <option value="SUBSET">Selected slots only</option>
          </Select>
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
            {mode === "SUBSET" ? "Select channel slots" : "Plan slots"}
          </legend>
          {selectedSchedule.slots.map((slot) => (
            <label
              key={slot.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm"
            >
              <input
                type="checkbox"
                disabled={mode === "FULL"}
                checked={mode === "FULL" || selectedSlotIds.includes(slot.id)}
                onChange={(event) =>
                  setSelectedSlotIds((current) =>
                    event.target.checked
                      ? [...current, slot.id]
                      : current.filter((id) => id !== slot.id),
                  )
                }
              />
              <span className="flex-1 text-neutral-200">{slot.title}</span>
              <span className="text-xs text-neutral-500">
                {slot.kind.replace("_", " ")} · {slot.time}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={
            !scheduleId ||
            save.isPending ||
            (mode === "SUBSET" && selectedSlotIds.length === 0)
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Assigning…" : "Assign schedule"}
        </Button>
      </div>
    </div>
  );
}
