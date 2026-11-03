"use client";

import type { CrmConversationListItem } from "@telegram-system/shared";
import { Bell, BellOff } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setCrmUnreadIgnored } from "@/lib/features/growth/crm-inbox-api";
import { patchInboxConversation } from "@/lib/features/growth/crm-inbox-cache";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";

/** The dialog stays in All chats, where this action can be reversed. */
export function CrmUnreadIgnoreControl({ id, ignored, compact = false }: { id: string; ignored: boolean; compact?: boolean }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => setCrmUnreadIgnored(id, !ignored),
    onSuccess: (result) => {
      patchInboxConversation(client, id, { ignoreInUnread: result.ignoreInUnread });
      client.setQueryData<CrmConversationListItem>(telegramCrmKeys.conversationDetail(id), (current) => current ? { ...current, ignoreInUnread: result.ignoreInUnread } : current);
      void client.invalidateQueries({ queryKey: telegramCrmKeys.inboxFolders(), exact: true });
      void client.invalidateQueries({ queryKey: telegramCrmKeys.inboxConversations(), refetchType: "active" });
    },
  });
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" aria-label={ignored ? "Show in Unread" : "Ignore in Unread"} title={ignored ? "Show this chat in Unread" : "Hide this chat from Unread"} aria-pressed={ignored} disabled={mutation.isPending} onClick={() => mutation.mutate()} className={compact ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400" : "rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"}>
      {compact ? (ignored ? <BellOff size={18} /> : <Bell size={18} />) : mutation.isPending ? "Saving…" : ignored ? "Show in Unread" : "Ignore in Unread"}
    </button>
    {mutation.isError ? <span role="alert" className="text-xs text-rose-300">Could not update Unread. Try again.</span> : null}
  </div>;
}
