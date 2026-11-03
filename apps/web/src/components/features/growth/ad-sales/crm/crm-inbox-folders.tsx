"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Folder, MessageCircle } from "lucide-react";
import type { ResolvedEmoji } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import styles from "./crm-inbox.module.css";
import { crmTagDisplayName } from "./crm-tag-presentation";
import { useCrmFolderOrder } from "./use-crm-folder-order";

type FolderItem = {
  id: string;
  name: string;
  color: string | null;
  emojiPresentation: ResolvedEmoji | null;
  unreadCount: number;
};

function Count({ count }: { count: number }) {
  return count > 0 ? (
    <span aria-hidden="true" className={styles.folderCount}>
      {count}
    </span>
  ) : null;
}

export function CrmInboxFolders({
  folders,
  selectedId,
  totalUnread,
  loading,
  error,
  onSelect,
  onRetry,
  userId,
  workspaceId,
}: {
  folders: FolderItem[];
  selectedId: string;
  totalUnread: number | null;
  loading: boolean;
  error: boolean;
  onSelect: (id: string) => void;
  onRetry: () => void;
  userId?: string;
  workspaceId?: string;
}) {
  const { ordered, move } = useCrmFolderOrder(folders, userId, workspaceId);
  const [reordering, setReordering] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  return (
    <nav aria-label="Telegram folders" className={`${styles.folderRail} app-scrollbar`} style={reordering ? { flexBasis: "5.5rem" } : undefined}>
      <button
        type="button"
        className={styles.folderButton}
        aria-label={totalUnread === null ? "All chats" : `All chats, ${totalUnread} unread messages`}
        aria-pressed={!selectedId}
        onClick={() => onSelect("")}
      >
        <span className={styles.folderIcon}>
          <MessageCircle size={21} aria-hidden="true" />
          <Count count={totalUnread ?? 0} />
        </span>
        <span className={styles.folderLabel}>All chats</span>
      </button>
      {loading ? <span role="status" className={styles.folderStatus}>Loading…</span> : null}
      {error ? (
        <div role="alert">
          <button type="button" className={styles.folderStatus} onClick={onRetry}>
            Folders unavailable. Retry
          </button>
        </div>
      ) : null}
      {!loading && !error && folders.length === 0 ? (
        <span className={styles.folderStatus}>No folders</span>
      ) : null}
      {ordered.map((folder, index) => (
        <div key={folder.id} draggable onDragStart={(event) => { setDragged(folder.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", folder.id); }} onDragEnd={() => setDragged(null)} onDragOver={(event) => { if (dragged) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (dragged) move(dragged, folder.id); setDragged(null); }}>
        <button
          type="button"
          className={`${styles.folderButton} w-full`}
          aria-label={`${folder.name}, ${folder.unreadCount} unread messages`}
          aria-pressed={selectedId === folder.id}
          title={`${folder.name} · Drag to reorder`}
          onClick={() => onSelect(folder.id)}
        >
          <span className={styles.folderIcon}>
            <Folder size={22} aria-hidden="true" style={{ color: folder.color ?? undefined }} />
            <Count count={folder.unreadCount} />
          </span>
          <span className={styles.folderLabel}>
            {folder.emojiPresentation ? <IconAvatar icon={folder.emojiPresentation} label={folder.name} size="xs" bordered={false} decorative className="!h-4 !w-4 !bg-transparent" /> : null}
            <span className={styles.folderName}>{crmTagDisplayName(folder)}</span>
          </span>
        </button>
        {reordering ? <div className="flex justify-center gap-1">
          <button type="button" aria-label={`Move ${folder.name} up`} disabled={index === 0} onClick={() => move(folder.id, ordered[index - 1].id)} className="flex h-10 w-10 items-center justify-center rounded text-neutral-300 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"><ArrowUp size={16} aria-hidden /></button>
          <button type="button" aria-label={`Move ${folder.name} down`} disabled={index === ordered.length - 1} onClick={() => move(folder.id, ordered[index + 1].id)} className="flex h-10 w-10 items-center justify-center rounded text-neutral-300 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"><ArrowDown size={16} aria-hidden /></button>
        </div> : null}
        </div>
      ))}
      {folders.length > 1 ? <button type="button" aria-pressed={reordering} onClick={() => setReordering(!reordering)} className={`${styles.folderStatus} rounded hover:bg-neutral-800`}>{reordering ? "Done" : "Reorder"}</button> : null}
    </nav>
  );
}
