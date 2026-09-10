"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MutualPromotionFolderDetail,
  MutualPromotionInviteLinkOption,
  UpdateMutualPromotionInviteLinksPayload,
} from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import {
  Button,
  CustomSelect,
  FormError,
  FormField,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { mutualPromotionFoldersApi } from "@/lib/features/growth/mutual-promotion-folders-api";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import { mutualPromotionFolderKeys } from "@/lib/query-keys";

type LinkDraft =
  UpdateMutualPromotionInviteLinksPayload["participants"][number];

export function MutualPromotionInviteLinksModal({
  open,
  folder,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  folder: MutualPromotionFolderDetail;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: UpdateMutualPromotionInviteLinksPayload) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<LinkDraft[]>(() =>
    folder.participants.map((participant) => ({
      participantId: participant.id,
      inviteLinkId: participant.inviteLink.id,
      inviteLinkMode: participant.inviteLinkMode,
    })),
  );
  const [importingParticipantId, setImportingParticipantId] = useState<
    string | null
  >(null);
  const [importErrors, setImportErrors] = useState<Record<string, string>>({});
  const [refreshingSelected, setRefreshingSelected] = useState(false);
  const queryInput = useMemo(
    () => ({
      folderId: folder.id,
      channelIds: folder.participants.map(
        (participant) => participant.telegramChannelId,
      ),
      startsAt: folder.startsAt,
      endsAt: folder.endsAt,
    }),
    [folder],
  );
  const inviteLinks = useQuery({
    queryKey: mutualPromotionFolderKeys.inviteOptions(queryInput),
    queryFn: () => mutualPromotionFoldersApi.inviteLinkOptions(queryInput),
    enabled: open,
  });
  const update = (participantId: string, patch: Partial<LinkDraft>) =>
    setDrafts((current) =>
      current.map((draft) =>
        draft.participantId === participantId ? { ...draft, ...patch } : draft,
      ),
    );
  const importInviteLink = async (
    participantId: string,
    telegramChannelId: string,
    url: string,
  ) => {
    setImportingParticipantId(participantId);
    setImportErrors((current) => ({ ...current, [participantId]: "" }));
    try {
      const option = await mutualPromotionFoldersApi.importInviteLink({
        telegramChannelId,
        url,
        folderId: folder.id,
        startsAt: folder.startsAt,
        endsAt: folder.endsAt,
      });
      await queryClient.invalidateQueries({
        queryKey: mutualPromotionFolderKeys.inviteOptionsRoot(),
        refetchType: "none",
      });
      queryClient.setQueryData<MutualPromotionInviteLinkOption[]>(
        mutualPromotionFolderKeys.inviteOptions(queryInput),
        (current = []) => [
          ...current.filter((item) => item.id !== option.id),
          option,
        ],
      );
      await queryClient.invalidateQueries({
        queryKey: mutualPromotionFolderKeys.detail(folder.id),
      });
      update(participantId, { inviteLinkId: option.id });
    } catch (error) {
      const responseMessage = axios.isAxiosError(error)
        ? error.response?.data?.message
        : null;
      const message = Array.isArray(responseMessage)
        ? responseMessage.join(" ")
        : typeof responseMessage === "string"
          ? responseMessage
          : "Telegram could not verify this invite link.";
      setImportErrors((current) => ({ ...current, [participantId]: message }));
    } finally {
      setImportingParticipantId(null);
    }
  };
  const refreshSelectedLinks = async () => {
    setRefreshingSelected(true);
    try {
      for (const participant of folder.participants) {
        await importInviteLink(
          participant.id,
          participant.telegramChannelId,
          participant.inviteLink.url,
        );
      }
    } finally {
      setRefreshingSelected(false);
    }
  };
  const original = new Map(
    folder.participants.map((participant) => [
      participant.id,
      {
        inviteLinkId: participant.inviteLink.id,
        inviteLinkMode: participant.inviteLinkMode,
      },
    ]),
  );
  const changed = drafts.some((draft) => {
    const initial = original.get(draft.participantId);
    return (
      initial?.inviteLinkId !== draft.inviteLinkId ||
      initial.inviteLinkMode !== draft.inviteLinkMode
    );
  });
  return (
    <Modal open={open} onClose={onClose} title="Edit invite links" size="md">
      <div className="space-y-4">
        <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-100">
          Replacing a link in an active folder restarts attribution for that
          channel from its current cached counters. Existing publications and
          expenses are not changed.
        </p>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={refreshingSelected || importingParticipantId !== null}
            onClick={() => void refreshSelectedLinks()}
          >
            {refreshingSelected
              ? "Refreshing selected links…"
              : "Refresh selected links from Telegram"}
          </Button>
        </div>
        {folder.participants.map((participant) => {
          const draft = drafts.find(
            (item) => item.participantId === participant.id,
          )!;
          const options = (inviteLinks.data ?? []).filter(
            (link) =>
              link.telegramChannelId === participant.telegramChannelId &&
              (link.available || link.id === participant.inviteLink.id),
          );
          const selectOptions = options.map((link) => ({
            value: link.id,
            label: link.name,
            meta: link.url,
            iconFallback: inviteLinkCreatorFallback(link),
            icon: (
              <TelegramInviteLinkCreatorAvatar
                photoUrl={link.creatorPhotoUrl}
                memberAvatar={link.creatorMember?.avatarPresentation}
                label={inviteLinkCreatorFallback(link)}
              />
            ),
            tone: link.available ? undefined : ("warning" as const),
          }));
          return (
            <section
              key={participant.id}
              className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4"
            >
              <div className="mb-3 flex items-center gap-3">
                <IconAvatar
                  icon={
                    participant.channel.photoUrl
                      ? {
                          type: "image",
                          id: participant.channel.id,
                          url: participant.channel.photoUrl,
                        }
                      : null
                  }
                  label={participant.channel.title}
                  size="md"
                  className="rounded-full"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    {participant.channel.title}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Current: {participant.inviteLink.name}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                <FormField label="Invite link" required>
                  <CustomSelect
                    value={draft.inviteLinkId}
                    onChange={(inviteLinkId) =>
                      update(participant.id, { inviteLinkId })
                    }
                    canCreateOption={(search) =>
                      !options.some(
                        (link) =>
                          link.url.toLowerCase() === search.toLowerCase(),
                      )
                    }
                    createOptionLabel={() => "Verify and add this invite link"}
                    onCreateOption={(url) =>
                      importInviteLink(
                        participant.id,
                        participant.telegramChannelId,
                        url,
                      )
                    }
                    disabled={
                      inviteLinks.isFetching ||
                      importingParticipantId === participant.id
                    }
                    placeholder={
                      inviteLinks.isFetching ? "Loading links…" : "Select link"
                    }
                    options={selectOptions}
                  />
                  {importingParticipantId === participant.id ? (
                    <p className="mt-1 text-xs text-blue-300">
                      Checking the link with Telegram…
                    </p>
                  ) : null}
                  <FormError
                    message={importErrors[participant.id] || undefined}
                  />
                </FormField>
                <FormField label="Link use">
                  <Select
                    value={draft.inviteLinkMode}
                    onChange={(event) =>
                      update(participant.id, {
                        inviteLinkMode: event.target.value as
                          | "FOLDER_ONLY"
                          | "REUSABLE",
                      })
                    }
                  >
                    <option value="FOLDER_ONLY">📁 Only this folder</option>
                    <option value="REUSABLE">♻️ Reusable for folders</option>
                  </Select>
                </FormField>
              </div>
            </section>
          );
        })}
        {inviteLinks.isError ? (
          <FormError message="Could not load available invite links." />
        ) : null}
        <FormError message={error ?? undefined} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || inviteLinks.isFetching || !changed}
            onClick={() =>
              void onSubmit({ participants: drafts }).catch(() => undefined)
            }
          >
            {saving ? "Saving…" : "Save invite links"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
