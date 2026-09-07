"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Forward, Trash2 } from "lucide-react";
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
import {
  readMutualPromotionDrafts,
  removeMutualPromotionDraft,
  writeMutualPromotionDraft,
  type MutualPromotionModalDraft,
} from "./mutual-promotion-modal-draft";

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
  const [pendingDrafts, setPendingDrafts] = useState<
    MutualPromotionModalDraft[]
  >(() =>
    !folder && typeof window !== "undefined"
      ? readMutualPromotionDrafts(window.localStorage)
      : [],
  );
  const [currentDraftId, setCurrentDraftId] = useState(() =>
    crypto.randomUUID(),
  );
  const draftReadyRef = useRef(folder !== null || pendingDrafts.length === 0);
  const draftDirtyRef = useRef(false);
  const persistedDraftJsonRef = useRef("");

  const persistedDraft = useMemo<MutualPromotionModalDraft>(
    () => ({ version: 1, id: currentDraftId, form: draft }),
    [currentDraftId, draft],
  );

  useEffect(() => {
    if (folder || !open || !draftReadyRef.current || pendingDrafts.length)
      return;
    const serialized = JSON.stringify(persistedDraft);
    if (serialized === persistedDraftJsonRef.current) return;
    persistedDraftJsonRef.current = serialized;
    if (draftDirtyRef.current) {
      writeMutualPromotionDraft(window.localStorage, persistedDraft);
    } else {
      removeMutualPromotionDraft(window.localStorage, currentDraftId);
    }
  }, [
    currentDraftId,
    draft,
    folder,
    open,
    pendingDrafts.length,
    persistedDraft,
  ]);

  const continueDraft = (saved: MutualPromotionModalDraft) => {
    draftDirtyRef.current = true;
    setCurrentDraftId(saved.id || crypto.randomUUID());
    setDraft(saved.form);
    persistedDraftJsonRef.current = JSON.stringify(saved);
    draftReadyRef.current = true;
    setPendingDrafts([]);
  };

  const deleteDraft = (saved: MutualPromotionModalDraft) => {
    removeMutualPromotionDraft(window.localStorage, saved.id);
    const remaining = pendingDrafts.filter((item) => item.id !== saved.id);
    setPendingDrafts(remaining);
    if (!remaining.length) {
      const clean = emptyFolderDraft(timezone);
      setDraft(clean);
      draftDirtyRef.current = false;
      setCurrentDraftId(crypto.randomUUID());
      persistedDraftJsonRef.current = JSON.stringify(clean);
      draftReadyRef.current = true;
    }
  };

  const createNewDraft = () => {
    draftDirtyRef.current = false;
    setDraft(emptyFolderDraft(timezone));
    setCurrentDraftId(crypto.randomUUID());
    persistedDraftJsonRef.current = "";
    draftReadyRef.current = true;
    setPendingDrafts([]);
  };

  const updateDraft = (next: FolderDraft) => {
    draftDirtyRef.current = true;
    setDraft(next);
  };

  const instants = useMemo(
    () => folderDraftInstants(draft, timezone),
    [draft, timezone],
  );
  const titlePreview = useMemo(() => resolveFolderDraftTitle(draft), [draft]);
  const channelIds = useMemo(
    () => draft.participants.map((participant) => participant.channelId).sort(),
    [draft.participants],
  );
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
    enabled: open && channelIds.length > 0 && Boolean(instants.endsAt),
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const submit = async () => {
    const validationError = validateDraft(draft, timezone);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    try {
      await onSubmit(toPayload(draft, timezone));
      if (!folder) {
        removeMutualPromotionDraft(window.localStorage, currentDraftId);
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
      {!folder && pendingDrafts.length ? (
        <div className="space-y-3">
          {pendingDrafts.map((saved) => (
            <section
              key={saved.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-700/60 bg-amber-950/20 p-3"
            >
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-white">
                  {saved.form.title.trim() ||
                    "Unfinished mutual-promotion draft"}
                </h3>
                <p className="mt-1 text-xs text-neutral-400">
                  {saved.form.participants.length} channel(s) · starts{" "}
                  {saved.form.startsDate} {saved.form.startsTime}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => deleteDraft(saved)}
                aria-label={`Delete draft ${saved.form.title || "Untitled"}`}
              >
                <Trash2 size={15} /> Delete
              </Button>
              <Button type="button" onClick={() => continueDraft(saved)}>
                Continue draft
              </Button>
            </section>
          ))}
          <div className="flex justify-end">
            <Button type="button" onClick={createNewDraft}>
              Create new
            </Button>
          </div>
        </div>
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
                participants={draft.participants}
                inviteLinks={inviteLinksQuery.data ?? []}
                inviteLinksLoading={inviteLinksQuery.isFetching}
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
