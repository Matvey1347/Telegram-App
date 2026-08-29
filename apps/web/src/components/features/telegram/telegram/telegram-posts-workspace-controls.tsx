"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Check, CheckCircle2, LoaderCircle, Plus, Trash2,
} from "lucide-react";
import {
  promptNotesApi,
  type BulkActionResult,
  type PromptNote,
  type TelegramChannelSelectOption as TelegramChannel,
} from "@/lib/api";
import { Button, FormField, Input, Modal, Textarea } from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconPicker } from "@/components/icons/icon-picker";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { TooltipBubble } from "@/components/ui/primitives";
import { ChannelMultiSelect } from "./telegram-channel-multi-select";

const POST_OPEN_CLICK_DELAY_MS = 180;

export type ProgressState = {
  title: string;
  current: number;
  total: number;
  item?: BulkActionResult["results"][number];
  result?: BulkActionResult;
};

export function BulkProgressOverlay({ progress }: { progress: ProgressState | null }) {
  if (!progress || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-x-0 top-4 z-[150] flex justify-center px-4">
      <div className="w-full max-w-xl rounded-xl border border-blue-600/70 bg-neutral-950 p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          {!progress.result ? (
            <LoaderCircle className="animate-spin text-blue-400" size={20} />
          ) : progress.result.failedCount ? (
            <AlertTriangle className="text-amber-400" size={20} />
          ) : (
            <CheckCircle2 className="text-emerald-400" size={20} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-white">{progress.title}</p>
              <span className="text-sm text-neutral-300">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            {progress.item?.message ? (
              <p className="mt-2 text-sm text-neutral-300">
                {progress.item.message}
              </p>
            ) : (
              <p className="mt-2 text-sm text-neutral-400">
                Waiting for the server…
              </p>
            )}
            {progress.result ? (
              <p className="mt-1 text-xs text-neutral-400">
                Completed: {progress.result.successCount} success,{" "}
                {progress.result.failedCount} failed,{" "}
                {progress.result.skippedCount} skipped
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function promptNoteTitle(note: PromptNote) {
  return note.title.trim() || "Untitled prompt";
}

function promptNoteDisplayTitle(note: PromptNote) {
  return note.title.trim();
}

export function CalendarSummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

export function PromptNotesButton({
  channelId,
  notes,
  isLoading,
  channels,
  currentMemberId,
  initialNoteId,
}: {
  channelId: string;
  notes: PromptNote[];
  isLoading: boolean;
  channels: TelegramChannel[];
  currentMemberId: string | null;
  initialNoteId: string;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const clickTimerRef = useRef<number | null>(null);
  const openedFromSearchRef = useRef("");
  const [editing, setEditing] = useState<PromptNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(
    () => () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!initialNoteId) {
      openedFromSearchRef.current = "";
      return;
    }
    if (openedFromSearchRef.current === initialNoteId) return;
    const note = notes.find((item) => item.id === initialNoteId);
    if (!note) return;
    setCreating(false);
    setEditing(note);
    setOpen(true);
    openedFromSearchRef.current = initialNoteId;
  }, [initialNoteId, notes]);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["prompt-notes", { telegramChannelId: channelId }],
    });

  const copyNote = async (note: PromptNote) => {
    await navigator.clipboard.writeText(note.content);
    setCopiedId(note.id);
    pushToast(`Prompt “${promptNoteTitle(note)}” copied.`, "success", 1800);
    window.setTimeout(
      () => setCopiedId((current) => (current === note.id ? null : current)),
      1400,
    );
  };

  const openWithDelay = (note: PromptNote) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      setEditing(note);
      clickTimerRef.current = null;
    }, POST_OPEN_CLICK_DELAY_MS);
  };

  const copyOnDoubleClick = (note: PromptNote) => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    void copyNote(note);
  };

  const removeNote = useMutation({
    mutationFn: promptNotesApi.remove,
    onSuccess: async () => {
      await invalidate();
      pushToast("Prompt note deleted.", "success");
      setEditing(null);
      setOpen(false);
    },
  });

  return (
    <>
      <Button
        variant="secondary"
        className="h-10 shrink-0 px-3 py-1.5"
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex items-center gap-2">
          <span className="text-sm">✏️</span>
          Notes
        </span>
      </Button>
      <Modal
        open={open}
        title="Prompt notes"
        onClose={() => {
          setOpen(false);
          setCreating(false);
          setEditing(null);
        }}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-neutral-400">
              Notes for this channel
            </div>
            <Button onClick={() => setCreating(true)}>
              <span className="inline-flex items-center gap-1.5">
                <Plus size={14} />
                Add note
              </span>
            </Button>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 text-sm text-neutral-400">
              <LoaderCircle size={14} className="animate-spin" />
              Loading…
            </div>
          ) : notes.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {notes.map((note) => {
                const displayTitle = promptNoteDisplayTitle(note);
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => openWithDelay(note)}
                    onDoubleClick={() => copyOnDoubleClick(note)}
                    className="group flex min-h-16 items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-3 text-left transition hover:border-blue-700 hover:bg-blue-950/20"
                  >
                    {copiedId === note.id ? (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-950/70 text-blue-200">
                        <Check size={14} />
                      </span>
                    ) : note.iconPresentation ? (
                      <IconAvatar
                        icon={note.iconPresentation}
                        label={displayTitle || "Prompt"}
                        size="xs"
                        className="!h-7 !w-7"
                      />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-950/70 text-sm">
                        {note.emoji || "📝"}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">
                        {displayTitle || "Untitled prompt"}
                      </span>
                    </span>
                    <TooltipBubble
                      side="bottom"
                      align="center"
                      className="max-w-64 px-2.5 py-1.5 text-neutral-200 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      Double-click to copy
                    </TooltipBubble>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
              No prompts for this channel
            </div>
          )}
        </div>
      </Modal>
      <PromptNoteEditorModal
        key={editing?.id || (creating ? "new" : "closed")}
        open={creating || Boolean(editing)}
        note={editing}
        channels={channels}
        currentMemberId={currentMemberId}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={invalidate}
        onDelete={(note) => removeNote.mutate(note.id)}
      />
    </>
  );
}

function PromptNoteEditorModal({
  open,
  note,
  channels,
  currentMemberId,
  onClose,
  onSaved,
  onDelete,
}: {
  open: boolean;
  note: PromptNote | null;
  channels: TelegramChannel[];
  currentMemberId: string | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onDelete: (note: PromptNote) => void;
}) {
  const { pushToast } = useAppToast();
  const [iconId, setIconId] = useState<string | null>(note?.iconId || null);
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(
    note?.assignedMemberId || currentMemberId,
  );
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>(
    note
      ? note.telegramChannelIds?.length
        ? note.telegramChannelIds
        : note.telegramChannelId
          ? [note.telegramChannelId]
          : []
      : [],
  );
  const save = useMutation({
    mutationFn: () =>
      note
        ? promptNotesApi.update(note.id, {
            iconId,
            title: title.trim(),
            content,
            assignedMemberId,
            telegramChannelIds: selectedChannelIds,
            postGroupId: null,
          })
        : promptNotesApi.create({
            iconId,
            title: title.trim(),
            content,
            assignedMemberId,
            telegramChannelIds: selectedChannelIds,
            postGroupId: null,
          }),
    onSuccess: async () => {
      await onSaved();
      pushToast(
        note ? "Prompt note updated." : "Prompt note created.",
        "success",
      );
    },
  });

  const close = () => {
    onClose();
  };

  const submitSave = () => {
    onClose();
    void save.mutateAsync().catch(() => undefined);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={note ? "Edit prompt note" : "Add prompt note"}
      size="xl"
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
          <FormField label="Emoji">
            <IconPicker
              compact
              iconId={iconId}
              onChange={setIconId}
              buttonLabel="Add emoji"
            />
          </FormField>
          <FormField label="Title">
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Researcher prompt"
            />
          </FormField>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Member">
            <MemberSelect
              value={assignedMemberId}
              onChange={(value) => setAssignedMemberId(value || null)}
              defaultToCurrent
            />
          </FormField>
          <FormField label="Show for">
            <ChannelMultiSelect
              channels={channels}
              selectedIds={selectedChannelIds}
              onChange={setSelectedChannelIds}
            />
          </FormField>
        </div>
        <FormField label="Prompt text">
          <Textarea
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste any amount of prompt text…"
            className="min-h-[14rem] max-h-[calc(100dvh-28rem)] overflow-y-auto font-mono leading-6"
          />
        </FormField>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-neutral-500">
            {content.length.toLocaleString()} characters
          </span>
          <div className="flex flex-wrap gap-2">
            {note ? (
              <Button variant="danger" onClick={() => onDelete(note)}>
                <span className="inline-flex items-center gap-1.5">
                  <Trash2 size={14} />
                  Delete
                </span>
              </Button>
            ) : null}
            <Button
              disabled={!title.trim() || !content.trim()}
              onClick={submitSave}
            >
              {note ? "Save note" : "Create note"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export { ChannelMultiSelect };
