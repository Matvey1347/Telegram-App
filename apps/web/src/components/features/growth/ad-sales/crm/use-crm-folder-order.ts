"use client";

import { useEffect, useMemo, useState } from "react";

type Folder = { id: string };

/** A personal browser preference; folder IDs remain scoped to the active workspace. */
export function useCrmFolderOrder<T extends Folder>(folders: T[], userId?: string, workspaceId?: string) {
  const key = userId && workspaceId
    ? `crm-folder-order:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}`
    : null;
  const [saved, setSaved] = useState<{ key: string | null; ids: string[] }>({ key: null, ids: [] });

  useEffect(() => {
    let ids: string[] = [];
    if (key) {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
        if (Array.isArray(value)) ids = [...new Set(value.filter((id): id is string => typeof id === "string"))];
      } catch { /* Unavailable or invalid storage falls back to server order. */ }
    }
    // A change of identity must never use the preceding workspace's order.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved({ key, ids });
  }, [key]);

  const ordered = useMemo(() => {
    const positions = new Map((saved.key === key ? saved.ids : []).map((id, index) => [id, index]));
    return folders.map((folder, index) => ({ folder, index }))
      .sort((a, b) => (positions.get(a.folder.id) ?? Infinity) - (positions.get(b.folder.id) ?? Infinity) || a.index - b.index)
      .map(({ folder }) => folder);
  }, [folders, key, saved]);

  const move = (id: string, targetId: string) => {
    const ids = ordered.map((folder) => folder.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    setSaved({ key, ids });
    if (key) {
      try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Keep the order for this session. */ }
    }
  };

  return { ordered, move };
}
