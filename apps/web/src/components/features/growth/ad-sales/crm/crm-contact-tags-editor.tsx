"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmContact, CrmTagSummary } from "@telegram-system/shared";
import { Button, MultiSelect } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import {
  patchCrmContactCaches,
  telegramCrmKeys,
} from "@/lib/features/growth/telegram-crm-query";
import {
  CrmTagEmoji,
  CrmTelegramFolderBadge,
  crmTagDisplayName,
} from "./crm-tag-presentation";

export function CrmContactTagsEditor({
  contact,
  canEdit,
}: {
  contact: Pick<CrmContact, "id"> & {
    tags: CrmTagSummary[];
  };
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const tags = useQuery({
    queryKey: telegramCrmKeys.tags(),
    queryFn: ({ signal }) => telegramCrmApi.listTags(signal),
    staleTime: 5 * 60_000,
  });
  const [selected, setSelected] = useState(() =>
    contact.tags
      .filter(
        (tag) =>
          tag.assignmentMode === "MANUAL" ||
          tag.systemKey?.startsWith("TELEGRAM_FOLDER:"),
      )
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

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-sm font-medium text-white">Tags</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Telegram-folder tags are marked with a Telegram icon and sync back to the connected Telegram account.
        </p>
        <MultiSelect
          value={selected}
          onChange={setSelected}
          disabled={!canEdit || save.isPending}
          options={(tags.data ?? contact.tags).map((tag) => ({
              value: tag.id,
              label: crmTagDisplayName(tag),
              icon: (
                <span className="inline-flex items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: tag.color ?? "#737373" }}
                  />
                  <CrmTagEmoji tag={tag} />
                  <CrmTelegramFolderBadge tag={tag} />
                </span>
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
