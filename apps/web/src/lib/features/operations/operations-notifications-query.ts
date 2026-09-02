import type {
  OperationsNotificationItem,
  OperationsNotificationPage,
  OperationsNotificationUnreadCount,
} from "@telegram-system/shared";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { operationsNotificationKeys } from "@/lib/query-keys";

type NotificationPages = InfiniteData<OperationsNotificationPage>;

export type NotificationCacheSnapshot = {
  unread: OperationsNotificationUnreadCount | undefined;
  list: NotificationPages | undefined;
};

export function patchCreatedNotification(
  queryClient: QueryClient,
  workspaceId: string,
  notification: OperationsNotificationItem,
) {
  if (notification.workspaceId !== workspaceId) return;
  const listKey = operationsNotificationKeys.list(workspaceId);
  const currentList = queryClient.getQueryData<NotificationPages>(listKey);
  if (
    currentList?.pages.some((page) =>
      page.items.some((item) => item.id === notification.id),
    )
  ) {
    return;
  }
  if (!notification.readAt) {
    queryClient.setQueryData<OperationsNotificationUnreadCount>(
      operationsNotificationKeys.unread(workspaceId),
      (current) => ({ unread: (current?.unread ?? 0) + 1 }),
    );
  }
  if (!currentList) return;
  queryClient.setQueryData<NotificationPages>(listKey, (current) => {
    if (!current) return current;
    const [first, ...rest] = current.pages;
    if (!first) return current;
    return {
      ...current,
      pages: [{ ...first, items: [notification, ...first.items] }, ...rest],
    };
  });
}

export function optimisticallyMarkNotificationsRead(
  queryClient: QueryClient,
  workspaceId: string,
  ids: readonly string[] | "all",
  readAt = new Date().toISOString(),
): NotificationCacheSnapshot {
  const unreadKey = operationsNotificationKeys.unread(workspaceId);
  const listKey = operationsNotificationKeys.list(workspaceId);
  const snapshot = {
    unread:
      queryClient.getQueryData<OperationsNotificationUnreadCount>(unreadKey),
    list: queryClient.getQueryData<NotificationPages>(listKey),
  };
  const targetIds = ids === "all" ? null : new Set(ids);
  let newlyRead = 0;
  queryClient.setQueryData<NotificationPages>(listKey, (current) => {
    if (!current) return current;
    return {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => {
          if (item.readAt || (targetIds && !targetIds.has(item.id)))
            return item;
          newlyRead += 1;
          return { ...item, readAt };
        }),
      })),
    };
  });
  queryClient.setQueryData<OperationsNotificationUnreadCount>(
    unreadKey,
    (current) => ({
      unread:
        ids === "all"
          ? 0
          : Math.max(0, (current?.unread ?? newlyRead) - newlyRead),
    }),
  );
  return snapshot;
}

export function restoreNotificationCache(
  queryClient: QueryClient,
  workspaceId: string,
  snapshot: NotificationCacheSnapshot,
) {
  const unreadKey = operationsNotificationKeys.unread(workspaceId);
  const listKey = operationsNotificationKeys.list(workspaceId);
  if (snapshot.unread) queryClient.setQueryData(unreadKey, snapshot.unread);
  else queryClient.removeQueries({ queryKey: unreadKey, exact: true });
  if (snapshot.list) queryClient.setQueryData(listKey, snapshot.list);
  else queryClient.removeQueries({ queryKey: listKey, exact: true });
}
