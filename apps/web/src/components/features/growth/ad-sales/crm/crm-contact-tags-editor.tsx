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
  const systemTags = (tags.data ?? []).filter((tag) => tag.isSystem);
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
  const createTag = useMutation({
    mutationFn: (name: string) => telegramCrmApi.createTag({ name }),
    onSuccess: (tag) => {
      setSelected((current) =>
        current.includes(tag.id) ? current : [...current, tag.id],
      );
      void queryClient.invalidateQueries({ queryKey: telegramCrmKeys.tags() });
      void queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.contactLists(),
      });
    },
  });

  if (tags.isLoading) return <LoadingState text="Loading tags…" />;
  return (
    <div className="space-y-4">
      {systemTags.length ? (
        <section>
          <h3 className="text-sm font-medium text-white">System tags</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Added by Folder and VP workflows. You can also assign them here.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {systemTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-xs text-neutral-300"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: tag.color ?? "#737373" }}
                />
                {tag.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}
      <section>
        <h3 className="text-sm font-medium text-white">Tags</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Add your own tags, then select the tags that describe this client.
        </p>
        <MultiSelect
          value={selected}
          onChange={setSelected}
          disabled={!canEdit || save.isPending}
          options={(tags.data ?? []).map((tag) => ({
              value: tag.id,
              label: tag.name,
              icon: (
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: tag.color ?? "#737373" }}
                />
              ),
            }))}
          placeholder="Select tags"
          searchPlaceholder="Search tags"
          canCreateOption={(name) =>
            !tags.data?.some(
              (tag) =>
                tag.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
            )
          }
          createOptionLabel={(name) => `Create tag “${name}”`}
          onCreateOption={async (name) => {
            await createTag.mutateAsync(name);
          }}
          creatingOption={createTag.isPending}
          className="mt-3"
        />
      </section>
      {tags.error || save.error || createTag.error ? (
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
