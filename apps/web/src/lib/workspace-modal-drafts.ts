export type StoredModalDraft = {
  id?: string;
  createdAt?: string;
};

function storageKey(storage: Pick<Storage, "getItem">, namespace: string) {
  const workspaceId = storage.getItem("selected-workspace-id") || "default";
  return `${namespace}:${workspaceId}`;
}

export function readWorkspaceModalDrafts<T extends StoredModalDraft>(
  storage: Storage | null | undefined,
  namespace: string,
  normalize: (value: unknown, index: number) => T | null,
) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(storageKey(storage, namespace));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const collection = parsed as { version?: unknown; drafts?: unknown };
    const source =
      collection?.version === 2 && Array.isArray(collection.drafts)
        ? collection.drafts
        : [parsed];
    return source.map(normalize).filter((draft): draft is T => Boolean(draft));
  } catch {
    return [];
  }
}

export function writeWorkspaceModalDraft<T extends StoredModalDraft>(
  storage: Storage | null | undefined,
  namespace: string,
  draft: T,
  normalize: (value: unknown, index: number) => T | null,
) {
  if (!storage) return;
  try {
    const drafts = readWorkspaceModalDrafts(storage, namespace, normalize);
    const persisted = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      createdAt: draft.createdAt || new Date().toISOString(),
    } as T;
    const index = drafts.findIndex((item) => item.id === persisted.id);
    if (index >= 0) drafts[index] = persisted;
    else drafts.push(persisted);
    storage.setItem(
      storageKey(storage, namespace),
      JSON.stringify({ version: 2, drafts }),
    );
  } catch {
    // Draft persistence is best-effort in restricted browsing modes.
  }
}

export function removeWorkspaceModalDraft<T extends StoredModalDraft>(
  storage: Storage | null | undefined,
  namespace: string,
  draftId: string | undefined,
  normalize: (value: unknown, index: number) => T | null,
) {
  if (!storage) return;
  try {
    const key = storageKey(storage, namespace);
    if (!draftId) {
      storage.removeItem(key);
      return;
    }
    const drafts = readWorkspaceModalDrafts(
      storage,
      namespace,
      normalize,
    ).filter((draft) => draft.id !== draftId);
    if (!drafts.length) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ version: 2, drafts }));
  } catch {
    // Draft cleanup is best-effort in restricted browsing modes.
  }
}
