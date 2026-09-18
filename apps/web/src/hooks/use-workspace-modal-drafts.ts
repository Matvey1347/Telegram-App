"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  readWorkspaceModalDrafts,
  removeWorkspaceModalDraft,
  writeWorkspaceModalDraft,
  type WorkspaceDraftPreview,
  type WorkspaceDraftStorageConfig,
  type WorkspaceFormDraft,
} from "@/lib/workspace-modal-drafts";

export type {
  WorkspaceDraftAvatar,
  WorkspaceDraftPreview,
  WorkspaceFormDraft,
} from "@/lib/workspace-modal-drafts";

type DraftOptions<T> = {
  namespace: string;
  workspaceId: string;
  open: boolean;
  enabled: boolean;
  value: T;
  createInitialValue: () => T;
  schemaVersion: number;
  normalize?: (
    value: unknown,
    sourceSchemaVersion: number,
    index: number,
    envelope?: Record<string, unknown>,
  ) => T | null;
  legacyNamespaces?: string[];
  legacyKeys?: string[];
  onRestore: (value: T, draft?: WorkspaceFormDraft<T>) => void;
  isMeaningful: (value: T) => boolean;
  preview?: WorkspaceDraftPreview;
  previewFor?: (value: T) => WorkspaceDraftPreview | undefined;
};

function newEnvelope<T>(value: T, schemaVersion: number) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    schemaVersion,
    form: value,
  } satisfies WorkspaceFormDraft<T>;
}

function initializeDraftSession<T>(
  config: WorkspaceDraftStorageConfig<T>,
  schemaVersion: number,
  latest: MutableRefObject<{
    createInitialValue: () => T;
    onRestore: (value: T, draft?: WorkspaceFormDraft<T>) => void;
    isMeaningful: (value: T) => boolean;
    previewFor: ((value: T) => WorkspaceDraftPreview | undefined) | undefined;
  }>,
  ready: MutableRefObject<boolean>,
  setPending: Dispatch<SetStateAction<WorkspaceFormDraft<T>[]>>,
  setCurrent: Dispatch<SetStateAction<WorkspaceFormDraft<T> | null>>,
) {
  const drafts = readWorkspaceModalDrafts(window.localStorage, config).map(
    (draft) => {
      if (draft.preview || !latest.current.previewFor) return draft;
      return writeWorkspaceModalDraft(window.localStorage, config, {
        ...draft,
        preview: latest.current.previewFor(draft.form),
      });
    },
  );
  const seed = latest.current.createInitialValue();
  setPending(drafts);
  setCurrent(newEnvelope(seed, schemaVersion));
  ready.current = drafts.length === 0;
  if (!drafts.length) latest.current.onRestore(seed);
}

export function useWorkspaceModalDrafts<T>(options: DraftOptions<T>) {
  const {
    namespace,
    workspaceId,
    open,
    enabled,
    value,
    createInitialValue,
    schemaVersion,
    normalize,
    legacyNamespaces,
    legacyKeys,
    onRestore,
    isMeaningful,
    preview,
    previewFor,
  } = options;
  const [pendingDrafts, setPendingDrafts] = useState<WorkspaceFormDraft<T>[]>(
    [],
  );
  const [currentDraft, setCurrentDraft] =
    useState<WorkspaceFormDraft<T> | null>(null);
  const [currentGeneration, setCurrentGeneration] = useState(0);
  const readyRef = useRef(false);
  const generationRef = useRef(0);
  const latestRef = useRef({
    createInitialValue,
    onRestore,
    isMeaningful,
    previewFor,
  });
  useLayoutEffect(() => {
    latestRef.current = {
      createInitialValue,
      onRestore,
      isMeaningful,
      previewFor,
    };
  }, [createInitialValue, isMeaningful, onRestore, previewFor]);
  const legacyNamespacesKey = JSON.stringify(legacyNamespaces ?? []);
  const legacyKeysKey = JSON.stringify(legacyKeys ?? []);
  const config = useMemo<WorkspaceDraftStorageConfig<T>>(
    () => ({
      namespace,
      workspaceId,
      schemaVersion,
      normalize: normalize ?? ((candidate) => candidate as T),
      legacyNamespaces: JSON.parse(legacyNamespacesKey) as string[],
      legacyKeys: JSON.parse(legacyKeysKey) as string[],
    }),
    [
      legacyKeysKey,
      legacyNamespacesKey,
      namespace,
      normalize,
      schemaVersion,
      workspaceId,
    ],
  );

  useLayoutEffect(() => {
    if (!open || !enabled) {
      readyRef.current = false;
      return;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setCurrentGeneration(generation);
    initializeDraftSession(
      config,
      schemaVersion,
      latestRef,
      readyRef,
      setPendingDrafts,
      setCurrentDraft,
    );
  }, [config, enabled, open, schemaVersion]);

  const previewJson = JSON.stringify(previewFor?.(value) ?? preview);
  const resolvedPreview = useMemo<WorkspaceDraftPreview | undefined>(
    () => (previewJson ? JSON.parse(previewJson) : undefined),
    [previewJson],
  );
  useEffect(() => {
    if (
      !open ||
      !enabled ||
      !readyRef.current ||
      !currentDraft ||
      currentGeneration !== generationRef.current
    )
      return;
    const candidate = {
      ...currentDraft,
      schemaVersion,
      form: value,
      preview: resolvedPreview,
    };
    if (latestRef.current.isMeaningful(value)) {
      writeWorkspaceModalDraft(window.localStorage, config, candidate);
    } else {
      removeWorkspaceModalDraft(window.localStorage, config, currentDraft.id);
    }
  }, [
    config,
    currentDraft,
    currentGeneration,
    enabled,
    open,
    resolvedPreview,
    schemaVersion,
    value,
  ]);

  const continueDraft = useCallback(
    (draft: WorkspaceFormDraft<T>) => {
      if (!open || !enabled) return;
      setCurrentDraft(draft);
      latestRef.current.onRestore(draft.form, draft);
      readyRef.current = true;
      setPendingDrafts([]);
    },
    [enabled, open],
  );

  const startCleanDraft = useCallback(() => {
    if (!open || !enabled) return;
    const seed = latestRef.current.createInitialValue();
    setCurrentDraft(newEnvelope(seed, schemaVersion));
    latestRef.current.onRestore(seed);
    readyRef.current = true;
    setPendingDrafts([]);
  }, [enabled, open, schemaVersion]);

  const deleteDraft = useCallback(
    (draft: WorkspaceFormDraft<T>) => {
      if (!open || !enabled) return;
      removeWorkspaceModalDraft(window.localStorage, config, draft.id);
      setPendingDrafts((current) => {
        const remaining = current.filter((item) => item.id !== draft.id);
        if (!remaining.length) queueMicrotask(startCleanDraft);
        return remaining;
      });
    },
    [config, enabled, open, startCleanDraft],
  );

  const clearCurrentDraft = useCallback(() => {
    if (!enabled || !currentDraft) return;
    removeWorkspaceModalDraft(window.localStorage, config, currentDraft.id);
    readyRef.current = false;
    setCurrentDraft(null);
  }, [config, currentDraft, enabled]);

  const showDraftPicker = useCallback(() => {
    if (!enabled || !currentDraft) return;
    if (latestRef.current.isMeaningful(value)) {
      writeWorkspaceModalDraft(window.localStorage, config, {
        ...currentDraft,
        form: value,
        preview: latestRef.current.previewFor?.(value) ?? preview,
      });
    }
    readyRef.current = false;
    setPendingDrafts(readWorkspaceModalDrafts(window.localStorage, config));
  }, [config, currentDraft, enabled, preview, value]);

  return {
    pendingDrafts,
    currentDraft,
    continueDraft,
    deleteDraft,
    createNewDraft: startCleanDraft,
    clearCurrentDraft,
    showDraftPicker,
  };
}
