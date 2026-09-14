"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import type {
  TelegramPublicationSchedule,
  TelegramPublicationScheduleInput,
  TelegramPublicationSlotKind,
} from "@telegram-system/shared";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const KINDS: Array<{ value: TelegramPublicationSlotKind; label: string }> = [
  { value: "CONTENT", label: "Regular publication" },
  { value: "AD", label: "Advertising" },
  { value: "MUTUAL_PROMOTION", label: "Mutual promotion" },
];

const blankDraft = (): TelegramPublicationScheduleInput => ({
  name: "Publication plan",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  slots: [
    { title: "Morning post", kind: "CONTENT", weekday: 1, time: "09:00" },
  ],
});

export function PublicationSchedulesModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] =
    useState<TelegramPublicationScheduleInput>(blankDraft);
  const schedules = useQuery({
    queryKey: telegramPublicationScheduleKeys.lists(),
    queryFn: telegramPublicationSchedulesApi.list,
  });
  const save = useMutation({
    mutationFn: () =>
      editingId
        ? telegramPublicationSchedulesApi.update(editingId, draft)
        : telegramPublicationSchedulesApi.create(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: telegramPublicationScheduleKeys.lists(),
      });
      pushToast(editingId ? "Schedule updated" : "Schedule created", "success");
      setEditingId(null);
      setDraft(blankDraft());
    },
    onError: () => pushToast("Could not save schedule", "error"),
  });
  const remove = useMutation({
    mutationFn: telegramPublicationSchedulesApi.remove,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: telegramPublicationScheduleKeys.lists(),
      });
      setEditingId(null);
      setDraft(blankDraft());
      pushToast("Schedule deleted", "success");
    },
    onError: () => pushToast("Could not delete schedule", "error"),
  });
  const edit = (schedule: TelegramPublicationSchedule) => {
    setEditingId(schedule.id);
    setDraft({
      name: schedule.name,
      timezone: schedule.timezone,
      isDefault: schedule.isDefault,
      slots: schedule.slots.map(
        ({ id, title, kind, weekday, time, position, isActive }) => ({
          id,
          title,
          kind,
          weekday,
          time,
          position,
          isActive,
        }),
      ),
    });
  };

  return (
    <Modal open onClose={onClose} title="Publication schedules" size="xl">
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              setEditingId(null);
              setDraft(blankDraft());
            }}
          >
            <Plus size={16} /> New schedule
          </Button>
          {schedules.isLoading ? (
            <p className="text-sm text-neutral-400">Loading schedules…</p>
          ) : null}
          {schedules.isError ? (
            <p className="text-sm text-rose-300">Could not load schedules.</p>
          ) : null}
          {schedules.data?.map((schedule) => (
            <button
              key={schedule.id}
              type="button"
              onClick={() => edit(schedule)}
              className={`w-full rounded-lg border p-3 text-left text-sm ${editingId === schedule.id ? "border-blue-600 bg-blue-950/30" : "border-neutral-800 bg-neutral-950/50 hover:bg-neutral-800"}`}
            >
              <span className="block font-medium text-neutral-100">
                {schedule.name}
              </span>
              <span className="text-xs text-neutral-500">
                {schedule.slots.length} slots · {schedule.assignedChannelsCount}{" "}
                channels
              </span>
            </button>
          ))}
        </aside>
        <ScheduleEditor draft={draft} onChange={setDraft} />
      </div>
      <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-neutral-800 pt-4">
        <div>
          {editingId ? (
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(editingId)}
            >
              <Trash2 size={16} />
              Delete
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            disabled={
              save.isPending || !draft.name.trim() || draft.slots.length === 0
            }
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ScheduleEditor({
  draft,
  onChange,
}: {
  draft: TelegramPublicationScheduleInput;
  onChange: (next: TelegramPublicationScheduleInput) => void;
}) {
  const patchSlot = (
    index: number,
    patch: Partial<TelegramPublicationScheduleInput["slots"][number]>,
  ) =>
    onChange({
      ...draft,
      slots: draft.slots.map((slot, i) =>
        i === index ? { ...slot, ...patch } : slot,
      ),
    });
  return (
    <section className="min-w-0 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Schedule name">
          <Input
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
          />
        </FormField>
        <FormField label="Timezone">
          <Input
            value={draft.timezone}
            onChange={(event) =>
              onChange({ ...draft, timezone: event.target.value })
            }
          />
        </FormField>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-neutral-100">Publication slots</h3>
          <p className="text-xs text-neutral-500">
            Separate editorial posts from advertising and mutual promotion.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange({
              ...draft,
              slots: [
                ...draft.slots,
                {
                  title: "New slot",
                  kind: "CONTENT",
                  weekday: 1,
                  time: "12:00",
                },
              ],
            })
          }
        >
          <Plus size={16} />
          Slot
        </Button>
      </div>
      <div className="space-y-2">
        {draft.slots.map((slot, index) => (
          <div
            key={slot.id ?? index}
            className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 sm:grid-cols-[1fr_150px_130px_110px_40px]"
          >
            <Input
              aria-label={`Slot ${index + 1} title`}
              value={slot.title}
              onChange={(event) =>
                patchSlot(index, { title: event.target.value })
              }
            />
            <Select
              aria-label={`Slot ${index + 1} type`}
              value={slot.kind}
              onChange={(event) =>
                patchSlot(index, {
                  kind: event.target.value as TelegramPublicationSlotKind,
                })
              }
            >
              {KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label={`Slot ${index + 1} weekday`}
              value={slot.weekday}
              onChange={(event) =>
                patchSlot(index, { weekday: Number(event.target.value) })
              }
            >
              {WEEKDAYS.map((day, i) => (
                <option key={day} value={i + 1}>
                  {day}
                </option>
              ))}
            </Select>
            <Input
              aria-label={`Slot ${index + 1} time`}
              type="time"
              value={slot.time}
              onChange={(event) =>
                patchSlot(index, { time: event.target.value })
              }
            />
            <Button
              type="button"
              variant="secondary"
              aria-label={`Remove slot ${index + 1}`}
              onClick={() =>
                onChange({
                  ...draft,
                  slots: draft.slots.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
