import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { CrmMessageListItem, CrmMessagesCursorPage } from "@telegram-system/shared";
import { findInboxConversation, patchInboxConversation, mergeInboxFirstPage, type CrmInboxData } from "./crm-inbox-cache";
import { listCrmInboxConversations, type CrmInboxConversationParams } from "./crm-inbox-api";
import { telegramCrmKeys } from "./telegram-crm-query";

/** Edits/reactions change preview content, never message facts or sales attention. */
export function patchEditedInboxMessage(client: QueryClient, message: CrmMessageListItem) {
  const current = findInboxConversation(client, message.conversationId);
  if (current?.lastMessage?.id !== message.id) return;
  patchInboxConversation(client, message.conversationId, { lastMessage: { ...message, text: message.text?.slice(0, 240) ?? null } });
}
export function patchDeletedChatMessages(client: QueryClient, conversationId: string, ids: string[]) {
  const tombstones = new Set(ids);
  client.setQueryData<InfiniteData<CrmMessagesCursorPage, string | null>>(telegramCrmKeys.messagesInfinite(conversationId), (data) => data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => tombstones.has(item.id) ? { ...item, deletedAt: item.deletedAt ?? new Date().toISOString(), text: null, contentMetadata: null } : item) })) } : data);
}

/** Deletion receipt has IDs only; refresh server-derived active list heads, preserving loaded tails. */
export function reconcileDeletedInboxHeads(client: QueryClient) {
  void client.invalidateQueries({ queryKey: telegramCrmKeys.inboxConversations(), refetchType: "none" });
  for (const query of client.getQueryCache().findAll({ queryKey: telegramCrmKeys.inboxConversations(), type: "active" })) {
    const params = query.queryKey[2] as CrmInboxConversationParams;
    void listCrmInboxConversations(params, null).then((page) => {
      if (client.getQueryCache().find({ queryKey: query.queryKey, exact: true }) !== query) return;
      client.setQueryData<CrmInboxData>(query.queryKey, (current) => mergeInboxFirstPage(current, page));
    }).catch(() => { /* Keep stale data for reconnect or manual refresh; do not retry/poll. */ });
  }
}
