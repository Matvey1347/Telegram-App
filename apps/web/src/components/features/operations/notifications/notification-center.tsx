"use client";

import type {
  OperationsNotificationItem,
  OperationsNotificationUnreadCount,
} from "@telegram-system/shared";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { operationsNotificationsApi } from "@/lib/features/operations/operations-notifications-api";
import {
  optimisticallyMarkNotificationsRead,
  restoreNotificationCache,
  type NotificationCacheSnapshot,
} from "@/lib/features/operations/operations-notifications-query";
import { operationsNotificationKeys } from "@/lib/query-keys";
import { NotificationPanel } from "./notification-panel";
import { NotificationPushSettings } from "./notification-push-settings";
import { useNotificationRealtime } from "./use-notification-realtime";

const PAGE_SIZE = 25;

export function NotificationCenter({
  workspaceId,
  enabled,
}: {
  workspaceId: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>();

  const unreadQuery = useQuery({
    queryKey: operationsNotificationKeys.unread(workspaceId),
    queryFn: ({ signal }) => operationsNotificationsApi.unreadCount(signal),
    enabled: enabled && Boolean(workspaceId),
  });
  const listQuery = useInfiniteQuery({
    queryKey: operationsNotificationKeys.list(workspaceId),
    queryFn: ({ pageParam, signal }) =>
      operationsNotificationsApi.list(
        { limit: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && Boolean(workspaceId) && open,
  });
  useNotificationRealtime({ workspaceId, enabled, panelOpen: open });

  const reconcileUnread = (result: OperationsNotificationUnreadCount) => {
    queryClient.setQueryData(
      operationsNotificationKeys.unread(workspaceId),
      result,
    );
  };
  const mutationLifecycle = (ids: readonly string[] | "all") => ({
    onMutate: async (): Promise<NotificationCacheSnapshot> => {
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: operationsNotificationKeys.unread(workspaceId),
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: operationsNotificationKeys.list(workspaceId),
          exact: true,
        }),
      ]);
      return optimisticallyMarkNotificationsRead(queryClient, workspaceId, ids);
    },
    onSuccess: reconcileUnread,
    onError: (
      _error: unknown,
      _variables: unknown,
      snapshot?: NotificationCacheSnapshot,
    ) => {
      if (snapshot)
        restoreNotificationCache(queryClient, workspaceId, snapshot);
    },
  });

  const markRead = useMutation({
    mutationFn: operationsNotificationsApi.markRead,
    ...mutationLifecycle([]),
    onMutate: async (id: string) => mutationLifecycle([id]).onMutate(),
  });
  const markVisible = useMutation({
    mutationFn: operationsNotificationsApi.markVisibleRead,
    ...mutationLifecycle([]),
    onMutate: async (ids: string[]) => mutationLifecycle(ids).onMutate(),
  });
  const markAll = useMutation({
    mutationFn: operationsNotificationsApi.markAllRead,
    ...mutationLifecycle("all"),
  });

  const updateAnchor = useCallback(() => {
    if (window.innerWidth < 1024 || !triggerRef.current) {
      setAnchorStyle(undefined);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setAnchorStyle({
      top: Math.min(rect.bottom + 8, window.innerHeight - 240),
      left: Math.max(12, Math.min(rect.right - 390, window.innerWidth - 402)),
    });
  }, []);
  useEffect(() => {
    if (!open) return;
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    return () => window.removeEventListener("resize", updateAnchor);
  }, [open, updateAnchor]);

  const close = useCallback(() => {
    setOpen(false);
    setSettingsOpen(false);
  }, []);
  const items = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listQuery.data],
  );
  const busy = markRead.isPending || markVisible.isPending || markAll.isPending;
  const mutationError = markRead.error ?? markVisible.error ?? markAll.error;

  if (!enabled || !workspaceId) return null;
  const unread = unreadQuery.data?.unread ?? 0;
  const badge = unread > 99 ? "99+" : String(unread);
  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateAnchor();
          setOpen((current) => !current);
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-800 text-neutral-300 transition hover:bg-neutral-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={`Notifications, ${unread} unread`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-neutral-950 bg-blue-500 px-1 text-center text-[10px] font-bold leading-4 text-white"
          >
            {badge}
          </span>
        ) : null}
      </button>
      <NotificationPanel
        open={open}
        onClose={close}
        unread={unread}
        state={{
          items,
          loading: listQuery.isLoading,
          error: listQuery.isError && !listQuery.isFetchNextPageError,
          paginationError: listQuery.isFetchNextPageError,
          hasMore: Boolean(listQuery.hasNextPage),
          loadingMore: listQuery.isFetchingNextPage,
        }}
        busy={busy}
        settingsOpen={settingsOpen}
        onSettingsChange={setSettingsOpen}
        onMarkAll={() => markAll.mutate(undefined)}
        onMarkVisible={() =>
          markVisible.mutate(
            items
              .filter((item) => !item.readAt)
              .slice(0, 50)
              .map((item) => item.id),
          )
        }
        onOpenNotification={(notification: OperationsNotificationItem) => {
          if (!busy && !notification.readAt) markRead.mutate(notification.id);
          close();
        }}
        onRetry={() => void listQuery.refetch()}
        onLoadMore={() => void listQuery.fetchNextPage()}
        anchorStyle={anchorStyle}
        settings={<NotificationPushSettings workspaceId={workspaceId} />}
        actionError={
          mutationError ? "Notification read status could not be saved." : null
        }
      />
    </div>
  );
}
