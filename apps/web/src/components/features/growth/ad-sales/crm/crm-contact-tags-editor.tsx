"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmContactDetail } from "@telegram-system/shared";
import { Button, LoadingState, MultiSelect } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import {
  patchCrmContactCaches,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";

export function CrmContactTagsEditor({
  contact,
  canEdit,
}: {
  contact: CrmContactDetail;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const tags = useQuery({
    queryKey: telegramCrmKeys.tags(),
    queryFn: ({ signal }) => telegramCrmApi.listTags(signal),
  });
  const automatic = contact.tags.filter(
    (tag) => tag.assignmentMode === "AUTOMATIC",
  );
  const [selected, setSelected] = useState(() =>
    contact.tags
      .filter((tag) => tag.assignmentMode === "MANUAL")
      .map((tag) => tag.id),
  );
  const save = useMutation({
    mutationFn: () => telegramCrmApi.setContactTags(contact.id, selected),
    onSuccess: (assigned) => {
      patchCrmContactCaches(queryClient, { id: contact.id, tags: assigned });
      void queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.contactLists(),
      });
    },
  });

  if (tags.isLoading) return <LoadingState text="Loading tags…" />;
  return (
    <div className="space-y-4">
      {automatic.length ? (
        <section>
          <h3 className="text-sm font-medium text-white">Automatic tags</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Added from advertising purchases and their channel networks.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {automatic.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
        </section>
      ) : null}
      <section>
        <h3 className="text-sm font-medium text-white">Workflow tags</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Mark contacts from folders, mutual promotion or inbound ad offers.
        </p>
        <MultiSelect
          value={selected}
          onChange={setSelected}
          disabled={!canEdit || save.isPending}
          options={(tags.data ?? [])
            .filter((tag) => tag.assignmentMode === "MANUAL")
            .map((tag) => ({
              value: tag.id,
              label: tag.name,
              icon: (
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: tag.color ?? "#737373" }}
                />
              ),
            }))}
          placeholder="Select workflow tags"
          searchPlaceholder="Search tags"
          className="mt-3"
        />
      </section>
      {tags.error || save.error ? (
        <p className="text-sm text-rose-300">Tags could not be saved.</p>
      ) : null}
      {canEdit ? (
        <div className="flex justify-end">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save tags"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TagChip({ tag }: { tag: CrmContactDetail["tags"][number] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-xs text-neutral-300">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: tag.color ?? "#737373" }}
      />
      {tag.name}
      {tag.isSystem ? (
        <span className="text-[10px] uppercase text-neutral-600">System</span>
      ) : null}
    </span>
  );
}
