"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  ResolvedEmoji,
  TelegramPublicationSchedule,
  TelegramPublicationScheduleInput,
} from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  Modal,
  canonicalizeTimeInputValue,
} from "@/components/ui/primitives";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import {
  PublicationScheduleEditor,
  PUBLICATION_SLOT_KINDS,
} from "./publication-schedule-editor";

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
  const modalDrafts = useWorkspaceModalDrafts<TelegramPublicationScheduleInput>({
    namespace: "telegram:publication-schedule:draft",
    workspaceId: selectedWorkspaceDraftScope(),
    schemaVersion: 1,
    open: editorOpen,
    enabled: editingId === null,
    value: draft,
    preview: { title: draft.name || "Untitled schedule", icon: draftIcon },
    createInitialValue: blankDraft,
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
            onContinue={(savedDraft) => {
              modalDrafts.continueDraft(savedDraft);
              setDraftIcon(savedDraft.preview?.icon ?? null);
            }}
            onDelete={modalDrafts.deleteDraft}
            onCreateNew={modalDrafts.createNewDraft}
          />
        ) : editorOpen ? (
          <PublicationScheduleEditor
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
                  {PUBLICATION_SLOT_KINDS.find((kind) => kind.value === slot.kind)?.label}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
