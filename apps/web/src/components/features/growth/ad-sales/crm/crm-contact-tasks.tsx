"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BellRing, Plus } from "lucide-react";
import type { CrmContact } from "@telegram-system/shared";
import {
  Button,
  DateInput,
  Input,
  Modal,
  TimeInput,
  isValidTimeInputValue,
  localDateTimeInputToIso,
} from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { formatDateTime } from "@/lib/date-format";
import { MemberSelect } from "@/components/features/workspace/member-select";

const taskKey = (contactId: string) =>
  ["telegram-ad-sales", "crm-contact", contactId, "tasks"] as const;

function defaultReminderDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DEFAULT_REMINDER_TIME = "10:00";

export function CrmContactTasks({
  contact,
  canEdit,
}: {
  contact: Pick<CrmContact, "id" | "ownerMemberId">;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(defaultReminderDate);
  const [dueTime, setDueTime] = useState(DEFAULT_REMINDER_TIME);
  const [assignedMemberId, setAssignedMemberId] = useState(
    () => contact.ownerMemberId ?? "",
  );
  const query = useQuery({
    queryKey: taskKey(contact.id),
    queryFn: () =>
      telegramAdSalesApi.listCrmTasks({
        advertiserId: contact.id,
        page: 1,
        pageSize: 25,
      }),
  });
  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKey(contact.id) }),
      queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.contactDetail(contact.id),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.contactLists(),
      }),
    ]);
  const create = useMutation({
    mutationFn: () =>
      telegramAdSalesApi.createAdvertiserTask(contact.id, {
        type: "MANUAL",
        assignedMemberId,
        priority: "NORMAL",
        title: title.trim(),
        dueAt: localDateTimeInputToIso(dueDate, dueTime)!,
      }),
    onSuccess: async () => {
      setTitle("");
      setDueDate(defaultReminderDate());
      setDueTime(DEFAULT_REMINDER_TIME);
      setCreating(false);
      await refresh();
    },
  });
  const complete = useMutation({
    mutationFn: (taskId: string) => telegramAdSalesApi.completeCrmTask(taskId),
    onSuccess: refresh,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      title.trim() &&
      dueDate &&
      isValidTimeInputValue(dueTime) &&
      assignedMemberId
    )
      create.mutate();
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Add reminder
          </Button>
        </div>
      ) : null}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Add reminder"
        size="sm"
        allowOverflow
        leadingHeaderAction={
          <button
            type="button"
            aria-label="Back to tasks"
            onClick={() => setCreating(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
          >
            <ArrowLeft size={17} />
          </button>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Reminder text"
            aria-label="Reminder text"
            required
            autoFocus
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-300">
              Reminder owner
            </label>
            <MemberSelect
              value={assignedMemberId}
              onChange={setAssignedMemberId}
              defaultToCurrent
              allowAssignOthers
              disabled={create.isPending}
            />
          </div>
          <DateInput
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            aria-label="Task due date"
            required
          />
          <TimeInput
            value={dueTime}
            onChange={(event) => setDueTime(event.target.value)}
            aria-label="Task due time"
            required
          />
          {!assignedMemberId ? (
            <p className="text-xs text-amber-300">
              Select who should receive this reminder.
            </p>
          ) : null}
          {create.error ? (
            <p className="text-xs text-rose-300">Reminder could not be created.</p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                create.isPending ||
                !assignedMemberId ||
                !title.trim() ||
                !dueDate ||
                !isValidTimeInputValue(dueTime)
              }
            >
              {create.isPending ? "Creating…" : "Add reminder"}
            </Button>
          </div>
        </form>
      </Modal>
      {query.isLoading ? (
        <p className="py-6 text-sm text-neutral-500">Loading reminders…</p>
      ) : null}
      {query.error ? (
        <div className="py-4">
          <p className="mb-2 text-sm text-rose-300">
            Reminders could not be loaded.
          </p>
          <Button variant="secondary" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!query.isLoading && !query.error && !query.data?.items.length ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
          <BellRing size={16} className="text-amber-300" />
          No reminders yet — add one for the next follow-up.
        </p>
      ) : null}
      {query.data?.items.length ? (
        <ol className="space-y-2">
          {query.data.items.map((task) => {
            const open =
              task.status === "OPEN" || task.status === "IN_PROGRESS";
            return (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {task.title}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {task.status} · due {formatDateTime(task.dueAt)}
                  </p>
                </div>
                {canEdit && open ? (
                  <Button
                    variant="secondary"
                    disabled={complete.isPending}
                    onClick={() => complete.mutate(task.id)}
                  >
                    Complete
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {complete.error ? (
        <p className="text-sm text-rose-300">Task could not be completed.</p>
      ) : null}
    </div>
  );
}
