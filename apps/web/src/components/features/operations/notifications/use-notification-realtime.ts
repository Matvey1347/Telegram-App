"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { fetchOperationsNotificationStream } from "@/lib/features/operations/operations-notifications-api";
import { patchCreatedNotification } from "@/lib/features/operations/operations-notifications-query";
import { operationsNotificationKeys } from "@/lib/query-keys";
import { useDocumentVisibility } from "@/hooks/use-document-visibility";

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
  const documentVisible = useDocumentVisibility();
  const panelOpenRef = useRef(panelOpen);
  const streamAttemptedRef = useRef(false);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  useEffect(() => {
    if (!workspaceId || !enabled || !documentVisible) return;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let controller: AbortController | null = null;
    let countTimer: ReturnType<typeof setTimeout> | null = null;
    const reconcileCount = () => {
      if (countTimer) return;
      countTimer = setTimeout(() => {
        countTimer = null;
        if (!stopped) void queryClient.invalidateQueries({ queryKey: operationsNotificationKeys.unread(workspaceId), exact: true });
      }, 1_000);
    };

    const connect = () => {
      if (stopped) return;
      const shouldReconcileOnOpen = streamAttemptedRef.current;
      streamAttemptedRef.current = true;
      const currentController = new AbortController();
      const startedAt = Date.now();
      controller = currentController;
      void fetchOperationsNotificationStream({
        signal: currentController.signal,
        onEvent: (event) => {
          if (stopped || event.workspaceId !== workspaceId) return;
          if (event.type === "notifications.invalidated") {
            if (panelOpenRef.current) {
              void queryClient.invalidateQueries({
                queryKey: operationsNotificationKeys.list(workspaceId),
                exact: true,
              });
            } else {
              queryClient.removeQueries({
                queryKey: operationsNotificationKeys.list(workspaceId),
                exact: true,
              });
            }
            reconcileCount();
            return;
          }
          void queryClient.cancelQueries({ queryKey: operationsNotificationKeys.unread(workspaceId), exact: true }).then(() => {
            if (!stopped && patchCreatedNotification(queryClient, workspaceId, event.notification)) reconcileCount();
          });
        },
        onOpen: () => {
          if (shouldReconcileOnOpen) {
            void queryClient.invalidateQueries({
              queryKey: operationsNotificationKeys.list(workspaceId),
              exact: true,
            });
            void queryClient.invalidateQueries({
              queryKey: operationsNotificationKeys.unread(workspaceId),
              exact: true,
            });
          }
        },
      })
        .catch(() => undefined)
        .finally(() => {
          if (controller === currentController) controller = null;
          if (stopped || currentController.signal.aborted) return;
          if (Date.now() - startedAt >= 30_000) attempt = 0;
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
      if (countTimer) clearTimeout(countTimer);
    };
  }, [documentVisible, enabled, queryClient, workspaceId]);
}
