import type { ResolvedEmoji } from "@telegram-system/shared";

export type WorkspaceDraftAvatar = {
  label: string;
  imageUrl?: string | null;
  icon?: ResolvedEmoji | null;
};
export type WorkspaceDraftPreview = {
  title?: string;
  subtitle?: string;
  detail?: string;
  badge?: string;
  icon?: ResolvedEmoji | null;
  avatars?: WorkspaceDraftAvatar[];
};
export type WorkspaceFormDraft<T> = {
  id: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  form: T;
  preview?: WorkspaceDraftPreview;
};
export type WorkspaceDraftStorageConfig<T> = {
  namespace: string;
  workspaceId: string;
  schemaVersion: number;
  normalize: (
    value: unknown,
    sourceSchemaVersion: number,
    index: number,
    envelope?: Record<string, unknown>,
  ) => T | null;
  legacyNamespaces?: string[];
  legacyKeys?: string[];
};

const COLLECTION_VERSION = 3;

export function selectedWorkspaceDraftScope() {
  if (typeof window === "undefined") return "default";
  return window.localStorage.getItem("selected-workspace-id") || "default";
}

export function workspaceModalDraftStorageKey(
  namespace: string,
  workspaceId: string,
) {
  return `${namespace}:${workspaceId}`;
}

function uniqueKeys<T>(config: WorkspaceDraftStorageConfig<T>) {
  return [
    workspaceModalDraftStorageKey(config.namespace, config.workspaceId),
    ...(config.legacyNamespaces ?? []).map((namespace) =>
      workspaceModalDraftStorageKey(namespace, config.workspaceId),
    ),
    ...(config.legacyKeys ?? []),
  ].filter((key, index, keys) => keys.indexOf(key) === index);
}

function safeRemove(storage: Storage, key: string) {
  try {
    if (storage.getItem(key) !== null) storage.removeItem(key);
  } catch {
    // Local persistence is best-effort in restricted browsing modes.
  }
}

function safeWrite(storage: Storage, key: string, value: string) {
  try {
    if (storage.getItem(key) === value) return true;
    storage.setItem(key, value);
    return true;
  } catch {
    // Quota and restricted-mode failures must not break the form.
    return false;
  }
}

function draftSource(parsed: unknown) {
  const collection = parsed as { version?: unknown; drafts?: unknown };
  return (collection?.version === 2 || collection?.version === 3) &&
    Array.isArray(collection.drafts)
    ? collection.drafts
    : [parsed];
}

function normalizeEnvelope<T>(
  candidate: unknown,
  index: number,
  keyIndex: number,
  config: WorkspaceDraftStorageConfig<T>,
): WorkspaceFormDraft<T> | null {
  if (!candidate || typeof candidate !== "object") return null;
  const raw = candidate as Record<string, unknown>;
  const hasEnvelope = "form" in raw;
  const sourceVersion = Number(
    hasEnvelope ? (raw.schemaVersion ?? raw.version ?? 0) : (raw.version ?? 0),
  );
  const form = config.normalize(
    hasEnvelope ? raw.form : candidate,
    Number.isFinite(sourceVersion) ? sourceVersion : 0,
    index,
    raw,
  );
  if (form == null) return null;
  const migratedAt = new Date().toISOString();
  const createdAt =
    typeof raw.createdAt === "string"
      ? raw.createdAt
      : typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : migratedAt;
  return {
    id:
      typeof raw.id === "string" && raw.id
        ? raw.id
        : `legacy-${keyIndex}-${index}`,
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    schemaVersion: config.schemaVersion,
    form,
    preview:
      hasEnvelope && raw.preview && typeof raw.preview === "object"
        ? (raw.preview as WorkspaceDraftPreview)
        : undefined,
  };
}

function serialize<T>(drafts: WorkspaceFormDraft<T>[]) {
  return JSON.stringify({ version: COLLECTION_VERSION, drafts });
}

export function readWorkspaceModalDrafts<T>(
  storage: Storage | null | undefined,
  config: WorkspaceDraftStorageConfig<T>,
) {
  if (!storage) return [];
  const keys = uniqueKeys(config);
  const primaryKey = keys[0];
  const collected: WorkspaceFormDraft<T>[] = [];
  const migratedKeys: string[] = [];
  for (const [keyIndex, key] of keys.entries()) {
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      return [];
    }
    if (!raw) continue;
    try {
      const drafts = draftSource(JSON.parse(raw))
        .map((item, index) => normalizeEnvelope(item, index, keyIndex, config))
        .filter((draft): draft is WorkspaceFormDraft<T> => Boolean(draft));
      if (!drafts.length) {
        safeRemove(storage, key);
        continue;
      }
      for (const draft of drafts) {
        if (!collected.some((item) => item.id === draft.id))
          collected.push(draft);
      }
      if (key !== primaryKey) migratedKeys.push(key);
    } catch {
      safeRemove(storage, key);
    }
  }
  if (!collected.length) return [];
  const migrated = safeWrite(storage, primaryKey, serialize(collected));
  if (migrated) migratedKeys.forEach((key) => safeRemove(storage, key));
  return collected;
}

export function writeWorkspaceModalDraft<T>(
  storage: Storage | null | undefined,
  config: WorkspaceDraftStorageConfig<T>,
  draft: WorkspaceFormDraft<T>,
) {
  if (!storage) return draft;
  const drafts = readWorkspaceModalDrafts(storage, config);
  const existing = drafts.find((item) => item.id === draft.id);
  const comparable = (value: WorkspaceFormDraft<T>) =>
    JSON.stringify({
      schemaVersion: value.schemaVersion,
      form: value.form,
      preview: value.preview,
    });
  if (existing && comparable(existing) === comparable(draft)) return existing;
  const now = new Date().toISOString();
  const persisted: WorkspaceFormDraft<T> = {
    ...draft,
    createdAt: existing?.createdAt ?? draft.createdAt ?? now,
    updatedAt: now,
  };
  const index = drafts.findIndex((item) => item.id === persisted.id);
  if (index >= 0) drafts[index] = persisted;
  else drafts.push(persisted);
  const stored = safeWrite(
    storage,
    workspaceModalDraftStorageKey(config.namespace, config.workspaceId),
    serialize(drafts),
  );
  return stored ? persisted : (existing ?? draft);
}

export function removeWorkspaceModalDraft<T>(
  storage: Storage | null | undefined,
  config: WorkspaceDraftStorageConfig<T>,
  draftId?: string,
) {
  if (!storage) return;
  const key = workspaceModalDraftStorageKey(config.namespace, config.workspaceId);
  if (!draftId) {
    safeRemove(storage, key);
    return;
  }
  const drafts = readWorkspaceModalDrafts(storage, config).filter(
    (draft) => draft.id !== draftId,
  );
  if (!drafts.length) safeRemove(storage, key);
  else safeWrite(storage, key, serialize(drafts));
}
