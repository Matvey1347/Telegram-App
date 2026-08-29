"use client";

import { useEffect, useRef } from "react";
import { telegramSystemBotApi } from "@/lib/api";

/** Keeps the connected System Bot aligned with the website-owned selection. */
export function useSystemBotWorkspaceSync(
  workspaceId: string,
  selectWebsiteWorkspace: (workspaceId: string) => void,
) {
  const lastSyncedWorkspaceId = useRef("");
  const websiteSyncInFlight = useRef<Promise<void> | null>(null);
  const workspaceIdRef = useRef(workspaceId);
  const selectWebsiteWorkspaceRef = useRef(selectWebsiteWorkspace);
  workspaceIdRef.current = workspaceId;
  selectWebsiteWorkspaceRef.current = selectWebsiteWorkspace;

  useEffect(() => {
    if (!workspaceId || lastSyncedWorkspaceId.current === workspaceId) return;
    lastSyncedWorkspaceId.current = workspaceId;
    const request = telegramSystemBotApi
      .selectCurrentWorkspace()
      .then(() => undefined)
      .catch(() => {
        // An unconnected bot is expected; retry after a workspace change/remount.
        lastSyncedWorkspaceId.current = "";
      })
      .finally(() => {
        if (websiteSyncInFlight.current === request)
          websiteSyncInFlight.current = null;
      });
    websiteSyncInFlight.current = request;
  }, [workspaceId]);

  useEffect(() => {
    const reconcileFromBot = () => {
      void (websiteSyncInFlight.current ?? Promise.resolve())
        .then(() => telegramSystemBotApi.connection())
        .then((connection) => {
          const botWorkspaceId = connection.currentWorkspaceId;
          if (
            connection.connected &&
            botWorkspaceId &&
            botWorkspaceId !== workspaceIdRef.current
          ) {
            selectWebsiteWorkspaceRef.current(botWorkspaceId);
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener("focus", reconcileFromBot);
    return () => window.removeEventListener("focus", reconcileFromBot);
  }, []);
}
