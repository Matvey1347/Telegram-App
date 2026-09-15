"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  ResolvedEmoji,
  TelegramPublicationSchedule,
  TelegramPublicationScheduleInput,
  TelegramPublicationSlotKind,
} from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconPicker } from "@/components/icons/icon-picker";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  FormField,
  Input,
  Modal,
  Select,
  TimeInput,
  canonicalizeTimeInputValue,
} from "@/components/ui/primitives";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

const KINDS: Array<{ value: TelegramPublicationSlotKind; label: string }> = [
  { value: "CONTENT", label: "📝 Regular publication" },
  { value: "AD", label: "📣 Advertising / mutual promotion" },
];

const blankDraft = (): TelegramPublicationScheduleInput => ({
  name: "",
  iconId: null,
  slots: [{ title: "Morning post", kind: "CONTENT", time: "09:00" }],
});

export function PublicationSchedulesModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] =
    useState<TelegramPublicationScheduleInput>(blankDraft);
  const [draftIcon, setDraftIcon] = useState<ResolvedEmoji | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<TelegramPublicationSchedule | null>(null);
  const schedules = useQuery({
    queryKey: telegramPublicationScheduleKeys.lists(),
    queryFn: telegramPublicationSchedulesApi.list,
  });
  const restoreDraft = useCallback(
    (value: TelegramPublicationScheduleInput) => {
      setDraft(value);
      setDraftIcon(null);
    },
    [],
  );
  const isMeaningfulDraft = useCallback(
    (value: TelegramPublicationScheduleInput) => {
      const initial = blankDraft();
      return Boolean(
        value.name.trim() ||
        value.iconId ||
        JSON.stringify(value.slots) !== JSON.stringify(initial.slots),
      );
    },
    [],
  );
  const modalDrafts = useWorkspaceModalDrafts({
    namespace: "telegram:publication-schedule:draft",
    open: editorOpen,
    enabled: editingId === null,
    value: draft,
    preview: { icon: draftIcon },
    emptyValue: blankDraft,
    onRestore: restoreDraft,
    isMeaningful: isMeaningfulDraft,
  });

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setDraft(blankDraft());
    setDraftIcon(null);
  };
  const edit = (schedule: TelegramPublicationSchedule) => {
    setEditingId(schedule.id);
    setDraftIcon(schedule.iconPresentation);
    setDraft({
      name: schedule.name,
      iconId: schedule.iconId,
      isDefault: schedule.isDefault,
      slots: schedule.slots.map(
        ({ id, title, kind, time, position, isActive }) => ({
          id,
          title,
          kind,
          time,
          position,
          isActive,
        }),
      ),
    });
    setEditorOpen(true);
  };
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...draft,
        slots: draft.slots.map((slot) => ({
          ...slot,
          time: canonicalizeTimeInputValue(slot.time) ?? slot.time,
        })),
      };
      return editingId
        ? telegramPublicationSchedulesApi.update(editingId, payload)
        : telegramPublicationSchedulesApi.create(payload);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<TelegramPublicationSchedule[]>(
        telegramPublicationScheduleKeys.lists(),
        (current = []) =>
          current.some((item) => item.id === saved.id)
            ? current.map((item) => (item.id === saved.id ? saved : item))
            : [...current, saved],
      );
      if (!editingId) modalDrafts.clearCurrentDraft();
      pushToast(editingId ? "Schedule updated" : "Schedule created", "success");
      closeEditor();
    },
    onError: () =>
      pushToast(
        "Could not save schedule. Your draft is still available.",
        "error",
      ),
  });
  const remove = useMutation({
    mutationFn: telegramPublicationSchedulesApi.remove,
    onSuccess: (_, removedId) => {
      queryClient.setQueryData<TelegramPublicationSchedule[]>(
        telegramPublicationScheduleKeys.lists(),
        (current = []) => current.filter((item) => item.id !== removedId),
      );
      void queryClient.invalidateQueries({
        queryKey: telegramPublicationScheduleKeys.all(),
        refetchType: "none",
      });
      closeEditor();
      pushToast("Schedule deleted", "success");
    },
    onError: () => pushToast("Could not delete schedule", "error"),
  });
  const valid =
    draft.name.trim() &&
    draft.slots.length > 0 &&
    draft.slots.every(
      (slot) => slot.title.trim() && canonicalizeTimeInputValue(slot.time),
    );

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Publication schedules"
        titleIcon={<CalendarClock size={19} aria-hidden="true" />}
        size="xl"
      >
        {editorOpen ? (
          <Button
            type="button"
            variant="secondary"
            className="mb-4 h-9 w-9 p-0"
            aria-label="Back to schedules"
            title="Back to schedules"
            onClick={closeEditor}
          >
            <span aria-hidden className="text-xl leading-none">
              ←
            </span>
          </Button>
        ) : null}
        {editorOpen && !editingId && modalDrafts.pendingDrafts.length ? (
          <ModalDraftPicker
            drafts={modalDrafts.pendingDrafts}
            titleFor={(value) => value.name.trim() || "Unfinished schedule"}
            iconIdFor={(value) => value.iconId}
            onContinue={(savedDraft) => {
              modalDrafts.continueDraft(savedDraft);
              setDraftIcon(savedDraft.preview?.icon ?? null);
            }}
            onDelete={modalDrafts.deleteDraft}
            onCreateNew={modalDrafts.createNewDraft}
          />
        ) : editorOpen ? (
          <ScheduleEditor
            draft={draft}
            icon={draftIcon}
            onIconChange={(iconId, presentation) => {
              setDraft((current) => ({ ...current, iconId }));
              setDraftIcon(presentation ?? null);
            }}
            onChange={setDraft}
          />
        ) : (
          <ScheduleOverview
            schedules={schedules.data ?? []}
            loading={schedules.isLoading}
            error={schedules.isError}
            onCreate={() => {
              setEditingId(null);
              setDraft(blankDraft());
              setDraftIcon(null);
              setEditorOpen(true);
            }}
            onEdit={edit}
            onDelete={setDeleteTarget}
            deletingId={remove.isPending ? (remove.variables ?? null) : null}
          />
        )}
        {editorOpen ? (
          <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-neutral-800 pt-4">
            <div>
              {editorOpen && editingId ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    const schedule = schedules.data?.find(
                      (item) => item.id === editingId,
                    );
                    if (schedule) setDeleteTarget(schedule);
                  }}
                >
                  <Trash2 size={16} /> Delete
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              {editorOpen &&
              (!modalDrafts.pendingDrafts.length || editingId) ? (
                <Button
                  type="button"
                  disabled={save.isPending || !valid}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "Saving…" : "Save schedule"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        entityName={deleteTarget?.name ?? "schedule"}
        description="The schedule and its channel assignments will be permanently removed."
        onConfirm={() =>
          deleteTarget ? remove.mutateAsync(deleteTarget.id) : undefined
        }
      />
    </>
  );
}

function ScheduleOverview({
  schedules,
  loading,
  error,
  onCreate,
  onEdit,
  onDelete,
  deletingId,
}: {
  schedules: TelegramPublicationSchedule[];
  loading: boolean;
  error: boolean;
  onCreate: () => void;
  onEdit: (schedule: TelegramPublicationSchedule) => void;
  onDelete: (schedule: TelegramPublicationSchedule) => void;
  deletingId: string | null;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-100">Workspace plans</h3>
          <p className="text-sm text-neutral-400">
            Create reusable daily slot plans, then select the slots needed by
            each channel.
          </p>
        </div>
        <Button type="button" onClick={onCreate}>
          <Plus size={16} /> New schedule
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-neutral-400">Loading schedules…</p>
      ) : null}
      {error ? (
        <p className="text-sm text-rose-300">Could not load schedules.</p>
      ) : null}
      {!loading && !error && !schedules.length ? (
        <Card className="border-dashed text-center text-sm text-neutral-400">
          No publication schedules yet.
        </Card>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {schedules.map((schedule) => (
          <Card key={schedule.id} className="space-y-3">
            <div className="flex items-start gap-3">
              <IconAvatar
                icon={schedule.iconPresentation}
                label={schedule.name}
                size="md"
                decorative
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-neutral-100">
                  {schedule.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {schedule.slots.length} slots ·{" "}
                  {schedule.assignedChannelsCount} channels
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={`Edit ${schedule.name}`}
                  onClick={() => onEdit(schedule)}
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  aria-label={`Delete ${schedule.name}`}
                  disabled={deletingId === schedule.id}
                  onClick={() => onDelete(schedule)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {schedule.slots.map((slot) => (
                <span
                  key={slot.id}
                  className="rounded-md border border-neutral-800 bg-neutral-950/60 px-2 py-1 text-xs text-neutral-300"
                >
                  {slot.time} ·{" "}
                  {KINDS.find((kind) => kind.value === slot.kind)?.label}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ScheduleEditor({
  draft,
  icon,
  onIconChange,
  onChange,
}: {
  draft: TelegramPublicationScheduleInput;
  icon: ResolvedEmoji | null;
  onIconChange: (iconId: string | null, icon?: ResolvedEmoji | null) => void;
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
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
        <FormField label="Emoji">
          <IconPicker
            compact
            iconId={draft.iconId}
            icon={icon}
            onChange={onIconChange}
            buttonLabel="Add emoji"
          />
        </FormField>
        <FormField label="Schedule name" required>
          <Input
            value={draft.name}
            placeholder="Main publication plan"
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
          />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-100">
            Daily publication slots
          </h3>
          <p className="text-xs text-neutral-500">
            The plan describes the busiest channel. Other channels can use only
            the slots they need.
          </p>
        </div>
        <Button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              slots: [
                ...draft.slots,
                { title: "New slot", kind: "CONTENT", time: "12:00" },
              ],
            })
          }
        >
          <Plus size={16} /> Slot
        </Button>
      </div>
      <div className="space-y-2">
        {draft.slots.map((slot, index) => (
          <div
            key={slot.id ?? index}
            className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 sm:grid-cols-[minmax(0,1fr)_180px_120px_44px]"
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
            <TimeInput
              aria-label={`Slot ${index + 1} time`}
              value={slot.time}
              onChange={(event) =>
                patchSlot(index, { time: event.target.value })
              }
            />
            <Button
              type="button"
              variant="danger"
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
