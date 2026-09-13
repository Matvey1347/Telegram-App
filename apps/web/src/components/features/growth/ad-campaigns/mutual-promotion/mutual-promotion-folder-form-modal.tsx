"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Forward } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type {
  CreateMutualPromotionFolderPayload,
  MutualPromotionFolderDetail,
} from "@telegram-system/shared";
import type { Account, TelegramChannel } from "@/lib/api";
import { mutualPromotionFoldersApi } from "@/lib/features/growth/mutual-promotion-folders-api";
import { mutualPromotionFolderKeys } from "@/lib/query-keys";
import {
  Button,
  DateInput,
  ErrorState,
  FormError,
  FormField,
  Input,
  LoadingState,
  Modal,
  Textarea,
  TimeInput,
} from "@/components/ui/primitives";
import {
  emptyFolderDraft,
  folderDetailToDraft,
  folderDraftInstants,
  resolveFolderDraftTitle,
  type FolderDraft,
} from "./mutual-promotion-form-types";
import { MutualPromotionParticipantsEditor } from "./mutual-promotion-participants-editor";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";

function validateDraft(draft: FolderDraft, timezone: string) {
  if (!draft.title.trim()) return "Enter a folder title.";
  if (
    !draft.startsDate ||
    !draft.startsTime ||
    !draft.endsDate ||
    !draft.endsTime
  )
    return "Set both the start and end date and time.";
  const { startsAt, endsAt } = folderDraftInstants(draft, timezone);
  if (!startsAt || !endsAt) return "Check the folder date and time.";
  if (Date.parse(endsAt) <= Date.parse(startsAt))
    return "The end must be later than the start.";
  if (!draft.participants.length)
    return "Select at least one participating channel.";
  if (draft.participants.some((participant) => !participant.inviteLinkId)) {
    return "Select an invite link for every participating channel.";
  }
  if (
    draft.participants.some(
      (participant) =>
        participant.role === "PAID" &&
        Boolean(participant.amount) !== Boolean(participant.accountId),
    )
  ) {
    return "For a paid-channel expense, select both an account and an amount.";
  }
  return null;
}

function toPayload(
  draft: FolderDraft,
  timezone: string,
): CreateMutualPromotionFolderPayload {
  const { startsAt, endsAt } = folderDraftInstants(draft, timezone);
  return {
    title: resolveFolderDraftTitle(draft),
    titleTemplate: draft.title.trim(),
    startsAt,
    endsAt,
    notes: draft.notes.trim() || null,
    participants: draft.participants.map((participant) => ({
      telegramChannelId: participant.channelId,
      role: participant.role,
      inviteLinkId: participant.inviteLinkId,
      inviteLinkMode: participant.inviteLinkMode,
      expense:
        participant.role === "PAID" &&
        participant.accountId &&
        participant.amount
          ? {
              accountId: participant.accountId,
              amount: Number(participant.amount),
            }
          : null,
    })),
  };
}

export function MutualPromotionFolderFormModal({
  open,
  folder,
  timezone,
  channels,
  accounts,
  resourcesLoading,
  resourcesError,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  folder: MutualPromotionFolderDetail | null;
  timezone: string;
  channels: TelegramChannel[];
  accounts: Account[];
  resourcesLoading: boolean;
  resourcesError: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateMutualPromotionFolderPayload) => Promise<void>;
}) {
  const [draft, setDraft] = useState<FolderDraft>(() =>
    folder ? folderDetailToDraft(folder, timezone) : emptyFolderDraft(timezone),
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(
      folder
        ? folderDetailToDraft(folder, timezone)
        : emptyFolderDraft(timezone),
    );
    setError(null);
  }, [folder, open, timezone]);
  const createEmptyDraft = useCallback(
    () => emptyFolderDraft(timezone),
    [timezone],
  );
  const restoreDraft = useCallback((value: FolderDraft) => {
    setDraft(value);
    setError(null);
  }, []);
  const isMeaningfulDraft = useCallback(
    (value: FolderDraft) =>
      Boolean(
        value.title.trim() ||
        value.notes.trim() ||
        value.participants.length > 0 ||
        JSON.stringify(value) !== JSON.stringify(emptyFolderDraft(timezone)),
      ),
    [timezone],
  );
  const modalDrafts = useWorkspaceModalDrafts({
    namespace: "mutual-promotion-folder:draft",
    open,
    enabled: !folder,
    value: draft,
    emptyValue: createEmptyDraft,
    onRestore: restoreDraft,
    isMeaningful: isMeaningfulDraft,
  });

  const updateDraft = useCallback((next: FolderDraft) => {
    setDraft(next);
  }, []);

  const instants = useMemo(
    () => folderDraftInstants(draft, timezone),
    [draft, timezone],
  );
  const titlePreview = useMemo(() => resolveFolderDraftTitle(draft), [draft]);
  const channelIds = useMemo(
    () => draft.participants.map((participant) => participant.channelId).sort(),
    [draft.participants],
  );
  const inviteOptionsRequestKey = JSON.stringify({
    folderId: folder?.id ?? null,
    channelIds,
    ...instants,
  });
  const [requestedInviteOptionsKey, setRequestedInviteOptionsKey] =
    useState("");
  const initialInviteLinksQuery = useQuery({
    queryKey: mutualPromotionFolderKeys.inviteOptions({
      folderId: folder?.id,
      channelIds,
      ...instants,
      initial: true,
    }),
    queryFn: () =>
      mutualPromotionFoldersApi.inviteLinkOptions({
        folderId: folder?.id,
        channelIds,
        ...instants,
        initial: true,
      }),
    enabled: open && channelIds.length > 0 && Boolean(instants.endsAt),
    staleTime: 30_000,
  });
  const inviteLinksQuery = useQuery({
    queryKey: mutualPromotionFolderKeys.inviteOptions({
      folderId: folder?.id,
      channelIds,
      ...instants,
    }),
    queryFn: () =>
      mutualPromotionFoldersApi.inviteLinkOptions({
        folderId: folder?.id,
        channelIds,
        ...instants,
      }),
    enabled:
      open &&
      channelIds.length > 0 &&
      Boolean(instants.endsAt) &&
      requestedInviteOptionsKey === inviteOptionsRequestKey,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const resolvedParticipants = useMemo(() => {
    const defaults = initialInviteLinksQuery.data;
    if (!defaults?.length) return draft.participants;
    return draft.participants.map((participant) => {
      if (participant.inviteLinkId) return participant;
      const defaultLink = defaults.find(
        (link) =>
          link.telegramChannelId === participant.channelId && link.available,
      );
      if (!defaultLink) return participant;
      return { ...participant, inviteLinkId: defaultLink.id };
    });
  }, [draft.participants, initialInviteLinksQuery.data]);
  const resolvedDraft = useMemo(
    () => ({ ...draft, participants: resolvedParticipants }),
    [draft, resolvedParticipants],
  );

  const submit = async () => {
    const validationError = validateDraft(resolvedDraft, timezone);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      await onSubmit(toPayload(resolvedDraft, timezone));
      if (!folder) {
        modalDrafts.clearCurrentDraft();
      }
    } catch {
      setError(
        "Could not save the folder. Check the selected links and dates.",
      );
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        folder ? "Edit mutual-promotion folder" : "New mutual-promotion folder"
      }
      size="xl"
    >
      {!folder && modalDrafts.pendingDrafts.length ? (
        <ModalDraftPicker
          drafts={modalDrafts.pendingDrafts}
          titleFor={(form) =>
            form.title.trim() || "Unfinished mutual-promotion draft"
          }
          onContinue={modalDrafts.continueDraft}
          onDelete={modalDrafts.deleteDraft}
          onCreateNew={modalDrafts.createNewDraft}
        />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-4">
              <FormField label="Folder title" required>
                <Input
                  autoFocus
                  value={draft.title}
                  onChange={(event) =>
                    updateDraft({ ...draft, title: event.target.value })
                  }
                  placeholder="September // [date-range]"
                />
                <p className="text-xs text-neutral-500">
                  Use [date-range] to insert the folder period automatically.
                </p>
                {draft.title.trim() ? (
                  <p className="text-xs font-medium text-blue-300">
                    Preview: {titlePreview}
                  </p>
                ) : null}
              </FormField>
              <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                <FormField label="Starts" required>
                  <DateInput
                    value={draft.startsDate}
                    onChange={(event) =>
                      updateDraft({ ...draft, startsDate: event.target.value })
                    }
                  />
                </FormField>
                <FormField label="Time" required>
                  <TimeInput
                    value={draft.startsTime}
                    onChange={(event) =>
                      updateDraft({ ...draft, startsTime: event.target.value })
                    }
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                <FormField label="Ends and removes posts" required>
                  <DateInput
                    value={draft.endsDate}
                    onChange={(event) =>
                      updateDraft({ ...draft, endsDate: event.target.value })
                    }
                  />
                </FormField>
                <FormField label="Time" required>
                  <TimeInput
                    value={draft.endsTime}
                    onChange={(event) =>
                      updateDraft({ ...draft, endsTime: event.target.value })
                    }
                  />
                </FormField>
              </div>
              <FormField label="Notes">
                <Textarea
                  rows={4}
                  value={draft.notes}
                  onChange={(event) =>
                    updateDraft({ ...draft, notes: event.target.value })
                  }
                  placeholder="Internal notes"
                />
              </FormField>
              {!folder ? (
                <div className="rounded-xl border border-blue-800/70 bg-blue-950/25 p-3">
                  <div className="flex items-start gap-2">
                    <Forward
                      size={17}
                      className="mt-0.5 shrink-0 text-blue-300"
                    />
                    <div>
                      <p className="text-sm font-semibold text-blue-100">
                        Next: forward and schedule publications
                      </p>
                      <p className="mt-1 text-xs text-blue-200/70">
                        After the folder is created, it opens automatically.
                        Forward posts through the system bot and set a
                        publication date and time for each one.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-3 text-sm text-blue-100">
                Reusable links may be selected in different folders, but active
                date ranges may not overlap. Links reserved by ordinary Ads are
                unavailable.
              </div>
            </div>
            {resourcesLoading ? (
              <LoadingState text="Loading channels and accounts…" />
            ) : resourcesError ? (
              <ErrorState text="Could not load channels or finance accounts." />
            ) : (
              <MutualPromotionParticipantsEditor
                channels={channels}
                accounts={accounts}
                participants={resolvedParticipants}
                inviteLinks={
                  inviteLinksQuery.data ??
                  initialInviteLinksQuery.data ??
                  folder?.participants.map((participant) => ({
                    ...participant.inviteLink,
                    telegramChannelId: participant.telegramChannelId,
                    requestedCount: 0,
                    isRevoked: false,
                    isDefaultForChannel: false,
                    available: true,
                    unavailableReason: null,
                  })) ??
                  []
                }
                inviteLinksLoading={
                  (requestedInviteOptionsKey === inviteOptionsRequestKey &&
                    inviteLinksQuery.isFetching) ||
                  initialInviteLinksQuery.isFetching
                }
                onInviteLinksOpen={() =>
                  setRequestedInviteOptionsKey(inviteOptionsRequestKey)
                }
                onChange={(participants) =>
                  updateDraft({ ...draft, participants })
                }
              />
            )}
          </div>
          {inviteLinksQuery.isError ? (
            <FormError message="Could not load available invite links." />
          ) : null}
          <FormError message={error ?? undefined} />
          <div className="mt-5 flex justify-end gap-2">
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
              onClick={() => void submit()}
              disabled={saving || resourcesLoading || resourcesError}
            >
              {saving
                ? "Saving…"
                : folder
                  ? "Save changes"
                  : "Create folder & add posts"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
