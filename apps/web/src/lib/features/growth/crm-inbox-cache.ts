import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { deriveCrmSalesAttention, type CrmInboxConversationItem, type CrmInboxConversationsPage, type CrmMessageListItem } from "@telegram-system/shared";
import type { CrmInboxConversationParams } from "./crm-inbox-api";
import { telegramCrmKeys } from "./telegram-crm-query";

export type CrmInboxData = InfiniteData<CrmInboxConversationsPage, string | null>;

/** Keep user-loaded cursor pages when refreshing the live head of the list. */
export function mergeInboxFirstPage(current: CrmInboxData | undefined, page: CrmInboxConversationsPage): CrmInboxData {
  if (!current?.pages.length) return { pages: [page], pageParams: [null] };
  const refreshedIds = new Set(page.items.map((item) => item.id));
  return { ...current, pages: current.pages.map((loaded, index) => {
    const retained = loaded.items.filter((item) => !refreshedIds.has(item.id));
    return index === 0 ? { ...page, items: [...page.items, ...retained] } : { ...loaded, items: retained };
  }) };
}

export function inboxItemMatches(item: CrmInboxConversationItem, params: CrmInboxConversationParams) {
  if (params.filter === "AI_LEADS") return false;
  if (params.folderId && !item.folders?.some((folder) => folder.id === params.folderId && (!folder.excludeRead || item.unreadCount > 0))) return false;
  if (item.state !== (params.filter === "ARCHIVED" ? "ARCHIVED" : "ACTIVE")) return false;
  if (params.filter === "UNREAD" && !item.unreadCount) return false;
  if (params.filter === "NEEDS_REPLY" && (item.attentionStatus !== undefined
    ? item.attentionStatus !== "NEEDS_REPLY"
    : item.contact?.manualSalesStatus || !item.lastInboundAt || (item.lastOutboundAt && item.lastInboundAt <= item.lastOutboundAt))) return false;
  if (params.filter === "FOLLOW_UP" && (item.contact?.archivedAt ||
    item.contact?.manualSalesStatus === "CLOSED" || item.contact?.manualSalesStatus === "DO_NOT_CONTACT" ||
    !item.contact?.nextContactAt || new Date(item.contact.nextContactAt).getTime() > Date.now())) return false;
  const search = params.search?.toLocaleLowerCase().replace(/^@/, "");
  return !search || [item.contact?.displayName, item.peer.firstName, item.peer.lastName,
    item.peer.username, item.contact?.telegramUsername].some((value) => value?.toLocaleLowerCase().includes(search));
}

export function findInboxConversation(client: QueryClient, id: string) {
  return client.getQueriesData<CrmInboxData>({ queryKey: telegramCrmKeys.inboxConversations() })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? [])
    .find((item) => item.id === id);
}

export function patchInboxConversation(client: QueryClient, id: string, patch: Partial<CrmInboxConversationItem>) {
  const known = findInboxConversation(client, id);
  for (const [key, data] of client.getQueriesData<CrmInboxData>({ queryKey: telegramCrmKeys.inboxConversations() })) {
    if (!data) continue;
    const params = key[2] as CrmInboxConversationParams;
    const present = data.pages.some((page) => page.items.some((item) => item.id === id));
    const candidate = known ? { ...known, ...patch } : undefined;
    client.setQueryData<CrmInboxData>(key, {
      ...data,
      pages: data.pages.map((page, index) => ({ ...page, items: [
        ...(!present && index === 0 && candidate && inboxItemMatches(candidate, params) ? [candidate] : []),
        ...page.items.flatMap((item) => {
        if (item.id !== id) return [item];
        const next = { ...item, ...patch };
        // Existing rows already passed server search, which also knows contact usernames.
        return inboxItemMatches(next, { ...params, search: undefined }) ? [next] : [];
      })] })),
    });
  }
}

/** A live event never creates a fake fully-loaded message history. */
export function patchInboxMessage(client: QueryClient, message: CrmMessageListItem) {
  const current = findInboxConversation(client, message.conversationId);
  if (!current) return false;
  if (current.lastMessageAt && current.lastMessageAt > message.sentAt) return true;
  const facts = { ...current, ...(message.direction === "INBOUND" ? { lastInboundAt: message.sentAt } : { lastOutboundAt: message.sentAt }) };
  patchInboxConversation(client, message.conversationId, {
    attentionStatus: deriveCrmSalesAttention({ state: facts.state, archivedAt: facts.contact?.archivedAt,
      manualStatus: facts.contact?.manualSalesStatus, nextContactAt: facts.contact?.nextContactAt ?? null, lastInboundAt: facts.lastInboundAt, lastOutboundAt: facts.lastOutboundAt }),
    lastMessageAt: message.sentAt,
    ...(message.direction === "INBOUND" ? { lastInboundAt: message.sentAt } : { lastOutboundAt: message.sentAt }),
    lastMessage: { ...message, text: message.text?.slice(0, 240) ?? null },
  });
  return true;
}
