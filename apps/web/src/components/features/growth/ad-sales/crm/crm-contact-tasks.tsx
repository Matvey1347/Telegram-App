"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import type { CrmContactDetail } from "@telegram-system/shared";
import {
  Button,
  DateInput,
  Input,
  Modal,
  TimeInput,
  isValidTimeInputValue,
} from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { formatDateTime } from "@/lib/date-format";

const taskKey = (contactId: string) =>
  ["telegram-ad-sales", "crm-contact", contactId, "tasks"] as const;

export function CrmContactTasks({
  contact,
  canEdit,
}: {
  contact: CrmContactDetail;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
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
        assignedMemberId: contact.ownerMemberId,
        priority: "NORMAL",
        title: title.trim(),
        dueAt: new Date(`${dueDate}T${dueTime}`).toISOString(),
      }),
    onSuccess: async () => {
      setTitle("");
      setDueDate("");
      setDueTime("");
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
      contact.ownerMemberId
    )
      create.mutate();
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Add task
          </Button>
        </div>
      ) : null}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create task"
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
            placeholder="Task title"
            aria-label="Task title"
            required
            autoFocus
          />
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
          {!contact.ownerMemberId ? (
            <p className="text-xs text-amber-300">
              Assign an owner before creating a task.
            </p>
          ) : null}
          {create.error ? (
            <p className="text-xs text-rose-300">Task could not be created.</p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={
                create.isPending ||
                !contact.ownerMemberId ||
                !title.trim() ||
                !dueDate ||
                !isValidTimeInputValue(dueTime)
              }
            >
              {create.isPending ? "Creating…" : "Create task"}
            </Button>
          </div>
        </form>
      </Modal>
      {query.isLoading ? (
        <p className="py-6 text-sm text-neutral-500">Loading tasks…</p>
      ) : null}
      {query.error ? (
        <div className="py-4">
          <p className="mb-2 text-sm text-rose-300">
            Tasks could not be loaded.
          </p>
          <Button variant="secondary" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!query.isLoading && !query.error && !query.data?.items.length ? (
        <p className="rounded-lg border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
          No tasks yet.
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
