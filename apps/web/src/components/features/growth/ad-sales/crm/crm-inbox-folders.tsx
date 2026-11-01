"use client";

import { Folder, MessageCircle } from "lucide-react";
import type { ResolvedEmoji } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import styles from "./crm-inbox.module.css";

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
}: {
  folders: FolderItem[];
  selectedId: string;
  totalUnread: number | null;
  loading: boolean;
  error: boolean;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <nav aria-label="Telegram folders" className={styles.folderRail}>
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
      {folders.map((folder) => (
        <button
          type="button"
          key={folder.id}
          className={styles.folderButton}
          aria-label={`${folder.name}, ${folder.unreadCount} unread messages`}
          aria-pressed={selectedId === folder.id}
          title={folder.name}
          onClick={() => onSelect(folder.id)}
        >
          <span className={styles.folderIcon}>
            <Folder size={22} aria-hidden="true" style={{ color: folder.color ?? undefined }} />
            <Count count={folder.unreadCount} />
          </span>
          <span className={styles.folderLabel}>
            {folder.emojiPresentation ? <IconAvatar icon={folder.emojiPresentation} label={folder.name} size="xs" bordered={false} decorative className="!h-4 !w-4 !bg-transparent" /> : null}
            <span className={styles.folderName}>{folder.name}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}
