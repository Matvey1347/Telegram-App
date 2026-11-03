"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listCrmInboxConversations } from "@/lib/features/growth/crm-inbox-api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";

/** Collect a snapshot first: removing unread rows while paging would skip entries. */
export async function markAllCrmUnread(onProgress: (done: number, total: number) => void, signal?: AbortSignal) {
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    signal?.throwIfAborted();
    const page = await listCrmInboxConversations({ filter: "UNREAD", limit: 100 }, cursor, signal);
    signal?.throwIfAborted();
    page.items.forEach((item) => ids.add(item.id));
    if (!page.hasMore) break;
    if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error("Invalid unread pagination");
    cursor = page.nextCursor;
    cursors.add(cursor);
  } while (cursor);
  let failed = 0;
  let done = 0;
  for (const id of ids) {
    signal?.throwIfAborted();
    try {
      // Refresh before taking a watermark; messages arriving later remain unread.
      await telegramCrmApi.importHistory(id, { limit: 100, recent: true }, signal);
      signal?.throwIfAborted();
      const page = await telegramCrmApi.listMessages(id, null, 50, signal);
      signal?.throwIfAborted();
      const watermark = page.items.reduce<number | null>((max, message) =>
        message.telegramMessageIdNumeric != null && (max == null || message.telegramMessageIdNumeric > max)
          ? message.telegramMessageIdNumeric : max, null);
      if (watermark == null) throw new Error("No current Telegram watermark");
      await telegramCrmApi.markConversationRead(id, watermark, signal);
      signal?.throwIfAborted();
    } catch {
      signal?.throwIfAborted();
      failed++;
    }
    onProgress(++done, ids.size);
  }
  return { total: ids.size, failed };
}

export function CrmUnreadMarkAll({ workspaceId }: { workspaceId: string | undefined }) {
  const client = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, [workspaceId]);
  const [result, setResult] = useState<string | null>(null);
  const run = async () => {
    const operation = new AbortController();
    controller.current = operation;
    setProgress({ done: 0, total: 0 });
    setResult(null);
    try {
      const outcome = await markAllCrmUnread((done, total) => setProgress({ done, total }), operation.signal);
      setResult(outcome.failed ? `Could not mark ${outcome.failed} of ${outcome.total} chats. Try again.` : `Marked ${outcome.total} chats read.`);
    } catch {
      if (!operation.signal.aborted) setResult("Could not load all unread chats. Try again.");
    } finally {
      if (operation.signal.aborted) return;
      controller.current = null;
      setProgress(null);
      void client.invalidateQueries({ queryKey: telegramCrmKeys.inboxConversations(), refetchType: "active" });
      void client.invalidateQueries({ queryKey: telegramCrmKeys.inboxFolders(), exact: true });
      void client.invalidateQueries({ queryKey: telegramCrmKeys.unread(), exact: true });
    }
  };
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <button type="button" disabled={!!progress} onClick={() => void run()} className="rounded-md px-2 py-1 text-blue-300 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
      {progress ? `Marking ${progress.done}/${progress.total}…` : "Mark all read"}
    </button>
    {result ? <span role="status" className="text-neutral-400">{result}</span> : null}
  </div>;
}
