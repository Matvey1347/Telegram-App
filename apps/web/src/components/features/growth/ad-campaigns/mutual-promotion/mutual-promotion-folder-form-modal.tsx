"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  ErrorState,
  FormError,
  LoadingState,
  Modal,
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
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import { MutualPromotionFolderDetails } from "./mutual-promotion-folder-details";

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
  const createInitialDraft = useCallback(
    () =>
      folder
        ? folderDetailToDraft(folder, timezone)
        : emptyFolderDraft(timezone),
    [folder, timezone],
  );
  const restoreDraft = useCallback((value: FolderDraft) => {
    setDraft(value);
    setError(null);
  }, []);
  const isMeaningfulDraft = useCallback(
    (value: FolderDraft) =>
      JSON.stringify(value) !== JSON.stringify(createInitialDraft()),
    [createInitialDraft],
  );
  const modalDrafts = useWorkspaceModalDrafts<FolderDraft>({
    namespace: folder
      ? `mutual-promotion-folder:edit:${folder.id}:draft`
      : "mutual-promotion-folder:draft",
    workspaceId: selectedWorkspaceDraftScope(),
    schemaVersion: 1,
    open,
    enabled: true,
    value: draft,
    createInitialValue: createInitialDraft,
    onRestore: restoreDraft,
    isMeaningful: isMeaningfulDraft,
    previewFor: (value) => ({
      title: value.title.trim() || "Unfinished mutual-promotion draft",
    }),
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
      modalDrafts.clearCurrentDraft();
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
      {modalDrafts.pendingDrafts.length ? (
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
            <MutualPromotionFolderDetails
              draft={draft}
              titlePreview={titlePreview}
              editing={Boolean(folder)}
              onChange={updateDraft}
            />
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
