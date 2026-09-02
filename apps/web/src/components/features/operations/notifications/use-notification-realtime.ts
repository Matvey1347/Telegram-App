"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { fetchOperationsNotificationStream } from "@/lib/features/operations/operations-notifications-api";
import { patchCreatedNotification } from "@/lib/features/operations/operations-notifications-query";
import { operationsNotificationKeys } from "@/lib/query-keys";

const MAX_RECONNECT_ATTEMPTS = 6;

export function useNotificationRealtime({
  workspaceId,
  enabled,
  panelOpen,
}: {
  workspaceId: string;
  enabled: boolean;
  panelOpen: boolean;
}) {
  const queryClient = useQueryClient();
  const panelOpenRef = useRef(panelOpen);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  useEffect(() => {
    if (!workspaceId || !enabled) return;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let openedOnce = false;
    let controller: AbortController | null = null;

    const connect = () => {
      if (stopped) return;
      controller = new AbortController();
      void fetchOperationsNotificationStream({
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "notifications.invalidated") {
            queryClient.removeQueries({
              queryKey: operationsNotificationKeys.list(workspaceId),
              exact: true,
            });
            void queryClient.invalidateQueries({
              queryKey: operationsNotificationKeys.unread(workspaceId),
              exact: true,
            });
            return;
          }
          patchCreatedNotification(
            queryClient,
            workspaceId,
            event.notification,
          );
        },
        onOpen: () => {
          attempt = 0;
          if (openedOnce) {
            void queryClient.invalidateQueries({
              queryKey: operationsNotificationKeys.unread(workspaceId),
              exact: true,
            });
            if (panelOpenRef.current) {
              void queryClient.invalidateQueries({
                queryKey: operationsNotificationKeys.list(workspaceId),
                exact: true,
              });
            }
          }
          openedOnce = true;
        },
      })
        .catch(() => undefined)
        .finally(() => {
          if (stopped || controller?.signal.aborted) return;
          attempt += 1;
          if (attempt > MAX_RECONNECT_ATTEMPTS) return;
          const delay = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
          retryTimer = setTimeout(connect, delay);
        });
    };

    connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled, queryClient, workspaceId]);
}
