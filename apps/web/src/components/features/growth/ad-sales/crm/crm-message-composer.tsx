"use client";
import { useCopilotText } from "./copilot/copilot-copy";

import { forwardRef, useImperativeHandle, useState, type ReactNode } from "react";
import { CrmCompactEditor } from "./crm-compact-editor";
import { Send } from "lucide-react";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import { Button, Modal } from "@/components/ui/primitives";

import type {
  CrmCopilotDraft,
  CrmCopilotSendApproval,
} from "@telegram-system/shared";
import {
  approvedComposerDraft,
  composerAiChanged,
  emptyComposerDraft as emptyDraft,
  normalizeComposerDraft as normalizeDraft,
  type ComposerDraft,
} from "./crm-composer-draft";
export type CrmMessageComposerHandle = {
  clearSent: (key: string) => void;
  insertApproved: (draft: CrmCopilotDraft) => void;
};

export const CrmMessageComposer = forwardRef<
  CrmMessageComposerHandle,
  {
    workspaceId: string;
    conversationId: string;
    sending: boolean;
    extraControls?: (hasText: boolean) => ReactNode;
    disabled?: boolean;
    onSend: (
      text: string,
      key: string,
      ai?: CrmCopilotSendApproval,
    ) => Promise<boolean>;
    onReviewAiEdit?: (id: string, text: string) => void;
  }
>(function CrmMessageComposer(
  {
    workspaceId,
    conversationId,
    sending,
    extraControls,
    disabled = false,
    onSend,
    onReviewAiEdit,
  },
  ref,
) {
  const t = useCopilotText();
  const [value, setValue] = useState<ComposerDraft>(emptyDraft);
  const [pendingInsert, setPendingInsert] = useState<ComposerDraft | null>(
    null,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const drafts = useWorkspaceModalDrafts({
    namespace: `crm-message:${conversationId}`,
    workspaceId,
    open: true,
    enabled: true,
    value,
    createInitialValue: emptyDraft,
    schemaVersion: 1,
    normalize: normalizeDraft,
    onRestore: setValue,
    isMeaningful: (draft) => Boolean(draft.text.trim()),
    preview: { title: "Message draft", subtitle: value.text.slice(0, 100) },
  });
  const clear = () => {
    drafts.clearCurrentDraft();
    drafts.createNewDraft();
    setValue(emptyDraft());
  };
  const insert = (draft: ComposerDraft) => {
    drafts.createNewDraft();
    setValue(draft);
    setPendingInsert(null);
  };
  const dirtyAi = composerAiChanged(value);
  const updateText = (text: string) => setValue((current) => ({
    ...current, text,
    key: current.ai ? `ai:${current.ai.aiDraftId}:${current.ai.aiDraftRevision}` : crypto.randomUUID(),
  }));
  useImperativeHandle(ref, () => ({
    insertApproved: (draft) => {
      const next = approvedComposerDraft(draft);
      if (!next || sending) return;
      if (value.text.trim() || drafts.pendingDrafts.length)
        setPendingInsert(next);
      else insert(next);
    },
    clearSent: (key) => {
      if (key === value.key && !composerAiChanged(value)) clear();
    },
  }));
  const submit = async () => {
    if (
      disabled ||
      sending ||
      dirtyAi ||
      !value.text.trim() ||
      value.text.length > 4096 ||
      drafts.pendingDrafts.length
    )
      return;
    const key = value.key || crypto.randomUUID();
    if (!value.key) setValue({ ...value, key });
    if (
      await (value.ai
        ? onSend(value.text, key, {
            aiDraftId: value.ai.aiDraftId,
            aiDraftRevision: value.ai.aiDraftRevision,
          })
        : onSend(value.text, key))
    ) {
      clear();
    }
  };
  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-900/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:px-3">
      {drafts.pendingDrafts.length ? (
        <div className="max-h-52 overflow-y-auto">
          <ModalDraftPicker
            drafts={drafts.pendingDrafts}
            onContinue={drafts.continueDraft}
            onDelete={drafts.deleteDraft}
            onCreateNew={drafts.createNewDraft}
          />
        </div>
      ) : (
        <div
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        >
          <CrmCompactEditor value={value.text} onChange={updateText} disabled={sending || disabled} onExpand={() => setEditorOpen(true)}
            leading={extraControls?.(Boolean(value.text))}
            trailing={value.text ? <button type="button" className="order-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white hover:bg-sky-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-40" aria-label="Send message" title="Send message" disabled={disabled || sending || dirtyAi || !value.text.trim() || value.text.length > 4096 || drafts.pendingDrafts.length > 0} onClick={() => void submit()}><Send size={18} aria-hidden /></button> : null} />
          <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title="Edit message" size="xl">
            <TelegramTextEditor value={value.text} onChange={updateText} disabled={sending || disabled} rows={8} placeholder="Write a message…" characterCountLabel={(count) => `${count} / 4096`} enableCustomEmoji />
            <div className="mt-3 flex justify-end"><Button onClick={() => setEditorOpen(false)}>Done</Button></div>
          </Modal>
        </div>
      )}
      {value.ai ? (
        <div className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs text-blue-200">
          <span>
            {dirtyAi
              ? "AI text changed — save and approve again before sending."
              : "Approved AI text · manual Send required"}
          </span>
          {dirtyAi && onReviewAiEdit ? (
            <Button
              variant="secondary"
              disabled={sending}
              onClick={() => onReviewAiEdit(value.ai!.aiDraftId, value.text)}
            >
              {t("Review edited AI text")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Modal
        open={!!pendingInsert}
        onClose={() => setPendingInsert(null)}
        title={t("Insert approved AI text?")}
        size="sm"
      >
        <p className="mb-4 text-sm text-neutral-300">
          {t(
            "Your existing message drafts will be kept. Create a separate composer draft with the approved AI text?",
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => pendingInsert && insert(pendingInsert)}>
            {t("Create AI composer draft")}
          </Button>
          <Button variant="secondary" onClick={() => setPendingInsert(null)}>
            {t("Keep current draft")}
          </Button>
        </div>
      </Modal>
      {value.text.length > 4096 ? (
        <p role="alert" className="text-xs text-rose-300">
          Telegram messages can contain at most 4096 characters.
        </p>
      ) : null}
    </div>
  );
});
