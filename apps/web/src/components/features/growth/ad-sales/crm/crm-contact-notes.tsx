"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmContactDetail } from "@telegram-system/shared";
import { Button, EmptyState, Textarea } from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { formatDateTime } from "@/lib/date-format";

const activityKey = (contactId: string) =>
  ["telegram-ad-sales", "crm-contact", contactId, "activities"] as const;

export function CrmContactNotes({
  contact,
  canEdit,
}: {
  contact: CrmContactDetail;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const query = useQuery({
    queryKey: activityKey(contact.id),
    queryFn: () =>
      telegramAdSalesApi.listAdvertiserActivities(contact.id, {
        page: 1,
        pageSize: 25,
      }),
  });
  const create = useMutation({
    mutationFn: () =>
      telegramAdSalesApi.createAdvertiserNote(contact.id, {
        type: "NOTE_ADDED",
        title: note.trim(),
      }),
    onSuccess: async () => {
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: activityKey(contact.id) }),
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.contactDetail(contact.id),
        }),
      ]);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (note.trim()) create.mutate();
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <form
          onSubmit={submit}
          className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
        >
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note about this client…"
            aria-label="New contact note"
            rows={3}
            required
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            {create.error ? (
              <p className="text-sm text-rose-300">Note could not be added.</p>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={create.isPending || !note.trim()}>
              {create.isPending ? "Adding…" : "Add note"}
            </Button>
          </div>
        </form>
      ) : null}
      {query.isLoading ? (
        <p className="py-6 text-sm text-neutral-500">Loading activity…</p>
      ) : null}
      {query.error ? (
        <div className="py-4">
          <p className="mb-2 text-sm text-rose-300">
            Activity could not be loaded.
          </p>
          <Button variant="secondary" onClick={() => query.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!query.isLoading && !query.error && !query.data?.items.length ? (
        <EmptyState text="No notes or activity yet." />
      ) : null}
      {query.data?.items.length ? (
        <ol className="space-y-2">
          {query.data.items.map((activity) => (
            <li
              key={activity.id}
              className="rounded-lg border border-neutral-800 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  {activity.type.replaceAll("_", " ")}
                </span>
                <time className="text-xs text-neutral-600">
                  {formatDateTime(activity.occurredAt)}
                </time>
              </div>
              <p className="mt-1 text-sm font-medium text-neutral-200">
                {activity.title}
              </p>
              {activity.description ? (
                <p className="mt-1 text-sm text-neutral-400">
                  {activity.description}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
