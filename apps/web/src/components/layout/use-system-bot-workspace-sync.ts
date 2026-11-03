"use client";

import { useEffect, useRef } from "react";
import { telegramSystemBotApi } from "@/lib/api";

let lastSyncedWorkspaceId = "";
let requestedWorkspaceId = "";
let workspaceSyncPromise: Promise<void> | null = null;

function syncWorkspaceSelection(workspaceId: string) {
  requestedWorkspaceId = workspaceId;
  if (lastSyncedWorkspaceId === workspaceId)
    return workspaceSyncPromise ?? Promise.resolve();
  if (workspaceSyncPromise) return workspaceSyncPromise;

  let shouldProcessLatestRequest = true;
  workspaceSyncPromise = (async () => {
    while (requestedWorkspaceId !== lastSyncedWorkspaceId) {
      const targetWorkspaceId = requestedWorkspaceId;
      try {
        await telegramSystemBotApi.selectCurrentWorkspace();
        lastSyncedWorkspaceId = targetWorkspaceId;
      } catch {
        // An unconnected bot is expected; retry on a later mount or workspace change.
        shouldProcessLatestRequest = requestedWorkspaceId !== targetWorkspaceId;
        break;
      }
    }
  })().finally(() => {
    workspaceSyncPromise = null;
    if (
      shouldProcessLatestRequest &&
      requestedWorkspaceId !== lastSyncedWorkspaceId
    )
      void syncWorkspaceSelection(requestedWorkspaceId);
  });
  return workspaceSyncPromise;
}

/** Keeps the connected System Bot aligned with the website-owned selection. */
export function useSystemBotWorkspaceSync(
  workspaceId: string,
  selectWebsiteWorkspace: (workspaceId: string) => void,
) {
  const websiteSyncInFlight = useRef<Promise<void> | null>(null);
  const botReconcileInFlight = useRef<Promise<void> | null>(null);
  const botReconcileQueued = useRef(false);
  const workspaceIdRef = useRef(workspaceId);
  const selectWebsiteWorkspaceRef = useRef(selectWebsiteWorkspace);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
    selectWebsiteWorkspaceRef.current = selectWebsiteWorkspace;
  }, [selectWebsiteWorkspace, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const request = syncWorkspaceSelection(workspaceId).finally(() => {
      if (websiteSyncInFlight.current === request)
        websiteSyncInFlight.current = null;
    });
    websiteSyncInFlight.current = request;
  }, [workspaceId]);

  useEffect(() => {
    let stopped = false;
    const reconcileFromBot = () => {
      if (stopped) return;
      if (botReconcileInFlight.current) {
        botReconcileQueued.current = true;
        return;
      }
      botReconcileQueued.current = false;
      const request = (websiteSyncInFlight.current ?? Promise.resolve())
        .then(() => telegramSystemBotApi.connection())
        .then((connection) => {
          if (stopped) return;
          const botWorkspaceId = connection.currentWorkspaceId;
          if (
            connection.connected &&
            botWorkspaceId &&
            botWorkspaceId !== workspaceIdRef.current
          ) {
            selectWebsiteWorkspaceRef.current(botWorkspaceId);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (botReconcileInFlight.current !== request) return;
          botReconcileInFlight.current = null;
          if (botReconcileQueued.current) reconcileFromBot();
        });
      botReconcileInFlight.current = request;
    };
    window.addEventListener("focus", reconcileFromBot);
    return () => {
      stopped = true;
      botReconcileQueued.current = false;
      window.removeEventListener("focus", reconcileFromBot);
    };
  }, []);
}
