import type {
  CrmContact,
  CrmContactDetail,
  CrmContactListItem,
  CrmContactsListResult,
  CrmConversationListItem,
  CrmConversationsListResult,
  CrmInboxItem,
  CrmInboxListResult,
  CrmMessageListItem,
  CrmMessagesCursorPage,
} from "@telegram-system/shared";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  CrmContactsParams,
  CrmConversationsParams,
  CrmInboxParams,
} from "./telegram-crm-api";

export const telegramCrmKeys = {
  root: ["telegram-crm"] as const,
  contactLists: () => ["telegram-crm", "contacts", "list"] as const,
  contactList: (params: CrmContactsParams) =>
    ["telegram-crm", "contacts", "list", params] as const,
  contactDetails: () => ["telegram-crm", "contacts", "detail"] as const,
  contactDetail: (contactId: string) =>
    ["telegram-crm", "contacts", "detail", contactId] as const,
  chatContexts: () => ["telegram-crm", "contacts", "chat-context"] as const,
  chatContext: (contactId: string) =>
    ["telegram-crm", "contacts", "chat-context", contactId] as const,
  inboxLists: () => ["telegram-crm", "inbox", "list"] as const,
  inboxList: (params: CrmInboxParams) =>
    ["telegram-crm", "inbox", "list", params] as const,
  conversationLists: () => ["telegram-crm", "conversations", "list"] as const,
  conversationList: (params: CrmConversationsParams) =>
    ["telegram-crm", "conversations", "list", params] as const,
  conversationDetail: (conversationId: string) =>
    ["telegram-crm", "conversations", "detail", conversationId] as const,
  messagesInfinite: (conversationId: string) =>
    ["telegram-crm", "messages", "infinite", conversationId] as const,
  unread: () => ["telegram-crm", "unread"] as const,
  settings: () => ["telegram-crm", "settings"] as const,
  automationStatuses: () => ["telegram-crm", "automations", "status"] as const,
  automationStatus: (contactId: string) =>
    ["telegram-crm", "automations", "status", contactId] as const,
  accountCapabilities: (accountId: string) =>
    ["telegram-crm", "accounts", accountId, "capabilities"] as const,
  accountSyncState: (accountId: string) =>
    ["telegram-crm", "accounts", accountId, "sync-state"] as const,
};

function patchPage<T extends { id: string }>(
  items: T[],
  id: string,
  patch: Partial<T>,
) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function patchCrmContactCaches(
  queryClient: QueryClient,
  contact: Partial<CrmContactListItem> & Pick<CrmContact, "id">,
) {
  const lists = queryClient.getQueriesData<CrmContactsListResult>({
    queryKey: telegramCrmKeys.contactLists(),
  });
  for (const [queryKey, current] of lists) {
    if (!current || !current.items.some((item) => item.id === contact.id)) {
      continue;
    }
    const params = queryKey[3] as CrmContactsParams | undefined;
    const leavesFilteredStage = Boolean(
      params?.stage && contact.stage && params.stage !== contact.stage,
    );
    queryClient.setQueryData<CrmContactsListResult>(queryKey, {
      ...current,
      items: leavesFilteredStage
        ? current.items.filter((item) => item.id !== contact.id)
        : patchPage(
            current.items,
            contact.id,
            contact as Partial<CrmContactListItem>,
          ),
      pagination: leavesFilteredStage
        ? paginationAfterRemoval(current.pagination)
        : current.pagination,
    });
  }
  queryClient.setQueryData<CrmContactDetail>(
    telegramCrmKeys.contactDetail(contact.id),
    (current) => (current ? { ...current, ...contact } : current),
  );
}

function paginationAfterRemoval(
  pagination: CrmContactsListResult["pagination"],
) {
  const totalItems = Math.max(0, pagination.totalItems - 1);
  const totalPages = totalItems
    ? Math.ceil(totalItems / pagination.pageSize)
    : 0;
  return {
    ...pagination,
    totalItems,
    totalPages,
    hasNextPage: totalPages > 0 && pagination.page < totalPages,
    hasPreviousPage: totalPages > 0 && pagination.page > 1,
  };
}

export function applyCrmReplyMessage(
  queryClient: QueryClient,
  contactId: string,
  direction: CrmMessageListItem["direction"],
) {
  queryClient.setQueriesData<CrmContactsListResult>(
    { queryKey: telegramCrmKeys.contactLists() },
    (current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => {
              if (item.id !== contactId) return item;
              const inboundMessageCount =
                item.replySummary.inboundMessageCount +
                (direction === "INBOUND" ? 1 : 0);
              const outboundMessageCount =
                item.replySummary.outboundMessageCount +
                (direction === "OUTBOUND" ? 1 : 0);
              const firstInbound =
                inboundMessageCount === 1 && outboundMessageCount === 0;
              return {
                ...item,
                replySummary: {
                  ...item.replySummary,
                  inboundMessageCount,
                  outboundMessageCount,
                  muted: false,
                  unreadCount:
                    item.replySummary.unreadCount +
                    (direction === "INBOUND" ? 1 : 0),
                  status:
                    direction === "OUTBOUND"
                      ? "WAITING_FOR_CLIENT"
                      : firstInbound
                        ? "FIRST_INBOUND_UNREAD"
                        : "CONVERSATION_UNANSWERED_UNREAD",
                },
              };
            }),
          }
        : current,
  );
}

export function changeCrmContactUnread(
  queryClient: QueryClient,
  contactId: string,
  delta: number,
) {
  queryClient.setQueryData<CrmContactDetail>(
    telegramCrmKeys.contactDetail(contactId),
    (current) =>
      current
        ? {
            ...current,
            unreadCount: Math.max(0, current.unreadCount + delta),
          }
        : current,
  );
}

export function removeCrmInboxPeer(queryClient: QueryClient, peerId: string) {
  queryClient.setQueriesData<CrmInboxListResult>(
    { queryKey: telegramCrmKeys.inboxLists() },
    (current) => {
      if (!current) return current;
      const items = current.items.filter((item) => item.peer.id !== peerId);
      const removed = current.items.length - items.length;
      return {
        ...current,
        items,
        pagination: {
          ...current.pagination,
          totalItems: Math.max(0, current.pagination.totalItems - removed),
        },
      };
    },
  );
}

export function patchCrmInboxPeer(
  queryClient: QueryClient,
  peerId: string,
  patch: Partial<CrmInboxItem>,
) {
  queryClient.setQueriesData<CrmInboxListResult>(
    { queryKey: telegramCrmKeys.inboxLists() },
    (current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.peer.id === peerId ? { ...item, ...patch } : item,
            ),
          }
        : current,
  );
}

export function patchCrmConversation(
  queryClient: QueryClient,
  conversationId: string,
  patch: Partial<CrmConversationListItem>,
) {
  queryClient.setQueriesData<CrmConversationsListResult>(
    { queryKey: telegramCrmKeys.conversationLists() },
    (current) =>
      current
        ? {
            ...current,
            items: patchPage(current.items, conversationId, patch),
          }
        : current,
  );
  queryClient.setQueryData<CrmConversationListItem>(
    telegramCrmKeys.conversationDetail(conversationId),
    (current) => (current ? { ...current, ...patch } : current),
  );
}

export function reconcileCrmConversationUnread(
  queryClient: QueryClient,
  conversationId: string,
  contactId: string | null,
  unreadCount: number,
  fallbackUnreadCount = 0,
) {
  const listed = queryClient
    .getQueriesData<CrmConversationsListResult>({
      queryKey: telegramCrmKeys.conversationLists(),
    })
    .flatMap(([, data]) => data?.items ?? [])
    .find((item) => item.id === conversationId);
  const direct = queryClient.getQueryData<CrmConversationListItem>(
    telegramCrmKeys.conversationDetail(conversationId),
  );
  const previousUnread =
    listed?.unreadCount ?? direct?.unreadCount ?? fallbackUnreadCount;
  patchCrmConversation(queryClient, conversationId, {
    unreadCount,
    readState: unreadCount ? "UNREAD" : "READ",
  });
  if (contactId && previousUnread !== unreadCount) {
    changeCrmContactUnread(
      queryClient,
      contactId,
      unreadCount - previousUnread,
    );
  }
}

export function appendCrmMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: CrmMessageListItem,
) {
  queryClient.setQueryData<InfiniteData<CrmMessagesCursorPage, string | null>>(
    telegramCrmKeys.messagesInfinite(conversationId),
    (current) => {
      if (!current) {
        return {
          pages: [{ items: [message], nextCursor: null, hasMore: false }],
          pageParams: [null],
        };
      }
      const alreadyPresent = current.pages.some((page) =>
        page.items.some(
          (item) =>
            item.id === message.id ||
            (message.clientIdempotencyKey &&
              item.clientIdempotencyKey === message.clientIdempotencyKey),
        ),
      );
      if (alreadyPresent) return current;
      return {
        ...current,
        pages: current.pages.map((page, index) =>
          index === 0 ? { ...page, items: [...page.items, message] } : page,
        ),
      };
    },
  );
}

export function reconcileCrmMessage(
  queryClient: QueryClient,
  conversationId: string,
  message: CrmMessageListItem,
) {
  queryClient.setQueryData<InfiniteData<CrmMessagesCursorPage, string | null>>(
    telegramCrmKeys.messagesInfinite(conversationId),
    (current) => {
      if (!current) return current;
      let found = false;
      const pages = current.pages.map((page) => ({
        ...page,
        items: page.items.flatMap((item) => {
          if (
            item.id === message.id ||
            (message.clientIdempotencyKey &&
              item.clientIdempotencyKey === message.clientIdempotencyKey)
          ) {
            if (found) return [];
            found = true;
            return [message];
          }
          return [item];
        }),
      }));
      if (!found && pages[0])
        pages[0] = { ...pages[0], items: [...pages[0].items, message] };
      return { ...current, pages };
    },
  );
}

export function markOptimisticCrmMessageFailed(
  queryClient: QueryClient,
  conversationId: string,
  clientIdempotencyKey: string,
) {
  queryClient.setQueryData<InfiniteData<CrmMessagesCursorPage, string | null>>(
    telegramCrmKeys.messagesInfinite(conversationId),
    (current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.clientIdempotencyKey === clientIdempotencyKey
                  ? { ...item, deliveryState: "FAILED" as const }
                  : item,
              ),
            })),
          }
        : current,
  );
}
