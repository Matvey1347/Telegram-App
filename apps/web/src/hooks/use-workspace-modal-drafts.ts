"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  readWorkspaceModalDrafts,
  removeWorkspaceModalDraft,
  writeWorkspaceModalDraft,
} from "@/lib/workspace-modal-drafts";
import type { ResolvedEmoji } from "@telegram-system/shared";

export type WorkspaceDraftPreview = {
  icon?: ResolvedEmoji | null;
};

export type WorkspaceFormDraft<T> = {
  version: 1;
  id?: string;
  createdAt?: string;
  form: T;
  preview?: WorkspaceDraftPreview;
};

function normalizeDraft<T>(value: unknown, index: number) {
  const draft = value as Partial<WorkspaceFormDraft<T>>;
  if (draft.version !== 1 || draft.form == null) return null;
  return {
    version: 1 as const,
    id: draft.id || `legacy-${index}`,
    createdAt: draft.createdAt || new Date(0).toISOString(),
    form: draft.form,
    preview: draft.preview,
  };
}

export function useWorkspaceModalDrafts<T>({
  namespace,
  open,
  enabled,
  value,
  preview,
  emptyValue,
  onRestore,
  isMeaningful,
}: {
  namespace: string;
  open: boolean;
  enabled: boolean;
  value: T;
  emptyValue: () => T;
  onRestore: (value: T, draft?: WorkspaceFormDraft<T>) => void;
  isMeaningful: (value: T) => boolean;
  preview?: WorkspaceDraftPreview;
}) {
  const [pendingDrafts, setPendingDrafts] = useState<WorkspaceFormDraft<T>[]>(
    [],
  );
  const [currentDraftId, setCurrentDraftId] = useState("");
  const initializedRef = useRef(false);
  const readyRef = useRef(false);
  const persistedJsonRef = useRef("");
  const normalize = useCallback(
    (candidate: unknown, index: number) => normalizeDraft<T>(candidate, index),
    [],
  );

  useEffect(() => {
    if (!open || !enabled) {
      initializedRef.current = false;
      readyRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    readyRef.current = false;
    const drafts = readWorkspaceModalDrafts(
      window.localStorage,
      namespace,
      normalize,
    );
    setPendingDrafts(drafts);
    setCurrentDraftId(crypto.randomUUID());
    persistedJsonRef.current = "";
    readyRef.current = drafts.length === 0;
  }, [enabled, namespace, normalize, open]);

  const currentDraft = useMemo<WorkspaceFormDraft<T>>(
    () => ({ version: 1, id: currentDraftId, form: value, preview }),
    [currentDraftId, preview, value],
  );

  useEffect(() => {
    if (
      !open ||
      !enabled ||
      !currentDraftId ||
      !readyRef.current ||
      pendingDrafts.length
    )
      return;
    const serialized = JSON.stringify(currentDraft);
    if (serialized === persistedJsonRef.current) return;
    persistedJsonRef.current = serialized;
    if (isMeaningful(value)) {
      writeWorkspaceModalDraft(
        window.localStorage,
        namespace,
        currentDraft,
        normalize,
      );
    } else {
      removeWorkspaceModalDraft(
        window.localStorage,
        namespace,
        currentDraftId,
        normalize,
      );
    }
  }, [
    currentDraft,
    currentDraftId,
    enabled,
    isMeaningful,
    namespace,
    normalize,
    open,
    pendingDrafts.length,
    value,
  ]);

  const continueDraft = useCallback(
    (draft: WorkspaceFormDraft<T>) => {
      setCurrentDraftId(draft.id || crypto.randomUUID());
      onRestore(draft.form, draft);
      persistedJsonRef.current = JSON.stringify(draft);
      readyRef.current = true;
      setPendingDrafts([]);
    },
    [onRestore],
  );

  const deleteDraft = useCallback(
    (draft: WorkspaceFormDraft<T>) => {
      removeWorkspaceModalDraft(
        window.localStorage,
        namespace,
        draft.id,
        normalize,
      );
      setPendingDrafts((current) => {
        const remaining = current.filter((item) => item.id !== draft.id);
        if (remaining.length === 0) {
          const clean = emptyValue();
          setCurrentDraftId(crypto.randomUUID());
          onRestore(clean);
          persistedJsonRef.current = "";
          readyRef.current = true;
        }
        return remaining;
      });
    },
    [emptyValue, namespace, normalize, onRestore],
  );

  const createNewDraft = useCallback(() => {
    const clean = emptyValue();
    setCurrentDraftId(crypto.randomUUID());
    onRestore(clean);
    persistedJsonRef.current = "";
    readyRef.current = true;
    setPendingDrafts([]);
  }, [emptyValue, onRestore]);

  const clearCurrentDraft = useCallback(() => {
    if (!enabled || !currentDraftId) return;
    removeWorkspaceModalDraft(
      window.localStorage,
      namespace,
      currentDraftId,
      normalize,
    );
    persistedJsonRef.current = "";
  }, [currentDraftId, enabled, namespace, normalize]);

  return {
    pendingDrafts,
    continueDraft,
    deleteDraft,
    createNewDraft,
    clearCurrentDraft,
  };
}
