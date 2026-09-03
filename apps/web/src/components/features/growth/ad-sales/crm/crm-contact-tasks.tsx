"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmContactDetail } from "@telegram-system/shared";
import { Button, EmptyState, Input } from "@/components/ui/primitives";
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
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const query = useQuery({
    queryKey: taskKey(contact.id),
    queryFn: () =>
      telegramAdSalesApi.listCrmTasks({
        advertiserId: contact.id,
        page: 1,
        pageSize: 25,
      }),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKey(contact.id) }),
      queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.contactDetail(contact.id),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.contactLists(),
      }),
    ]);
  };
  const create = useMutation({
    mutationFn: () =>
      telegramAdSalesApi.createAdvertiserTask(contact.id, {
        type: "MANUAL",
        assignedMemberId: contact.ownerMemberId,
        priority: "NORMAL",
        title: title.trim(),
        dueAt: new Date(dueAt).toISOString(),
      }),
    onSuccess: async () => {
      setTitle("");
      setDueAt("");
      await refresh();
    },
  });
  const complete = useMutation({
    mutationFn: (taskId: string) => telegramAdSalesApi.completeCrmTask(taskId),
    onSuccess: refresh,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim() && dueAt && contact.ownerMemberId) create.mutate();
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3 sm:grid-cols-[1fr_220px_auto]"
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Task title"
            aria-label="Task title"
            required
          />
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            aria-label="Task due date"
            required
          />
          <Button
            type="submit"
            disabled={create.isPending || !contact.ownerMemberId}
          >
            {create.isPending ? "Adding…" : "Add task"}
          </Button>
          {!contact.ownerMemberId ? (
            <p className="text-xs text-amber-300 sm:col-span-3">
              Assign an owner before creating a task.
            </p>
          ) : null}
          {create.error ? (
            <p className="text-xs text-rose-300 sm:col-span-3">
              Task could not be created.
            </p>
          ) : null}
        </form>
      ) : null}
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
        <EmptyState text="No tasks yet." />
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
