"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PropsWithChildren,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/primitives";
import { withFreshApiReads, workspacesApi } from "@/lib/api";
import { authKeys, workspaceKeys } from "@/lib/query-keys";
import {
  clearPersistedQueryCache,
  isWorkspaceScopedQuery,
} from "./query-provider";

const WORKSPACE_CHANGE_EVENT = "telegram-system:workspace-changed";

function subscribeToWorkspaceChange(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(WORKSPACE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(WORKSPACE_CHANGE_EVENT, onChange);
  };
}

function selectedWorkspaceSnapshot() {
  return window.localStorage.getItem("selected-workspace-id") ?? "";
}

export function announceSelectedWorkspaceChange() {
  window.dispatchEvent(new Event(WORKSPACE_CHANGE_EVENT));
}

export function NotificationNavigationCoordinator({
  children,
}: PropsWithChildren) {
  const requestedWorkspaceId =
    useSearchParams().get("workspaceId")?.trim() ?? "";
  const selectedWorkspaceId = useSyncExternalStore(
    subscribeToWorkspaceChange,
    selectedWorkspaceSnapshot,
    () => "",
  );
  const queryClient = useQueryClient();
  const router = useRouter();
  const [deniedTarget, setDeniedTarget] = useState<string | null>(null);
  const needsSwitch =
    Boolean(requestedWorkspaceId) &&
    requestedWorkspaceId !== selectedWorkspaceId;

  useEffect(() => {
    if (!needsSwitch || deniedTarget === requestedWorkspaceId) return;
    let active = true;
    const previousWorkspaceId = selectedWorkspaceId;
    void queryClient
      .fetchQuery({
        queryKey: workspaceKeys.workspaces(),
        queryFn: () => withFreshApiReads(workspacesApi.list),
        staleTime: 0,
      })
      .then(async (workspaces) => {
        if (!active) return;
        if (
          !workspaces.some((workspace) => workspace.id === requestedWorkspaceId)
        ) {
          if (previousWorkspaceId) {
            window.localStorage.setItem(
              "selected-workspace-id",
              previousWorkspaceId,
            );
          } else {
            window.localStorage.removeItem("selected-workspace-id");
          }
          setDeniedTarget(requestedWorkspaceId);
          return;
        }
        const shouldRemove = (queryKey: readonly unknown[]) =>
          isWorkspaceScopedQuery(queryKey) ||
          queryKey.join(":") === authKeys.me().join(":");
        await queryClient.cancelQueries({
          predicate: (query) => shouldRemove(query.queryKey),
        });
        queryClient.removeQueries({
          predicate: (query) => shouldRemove(query.queryKey),
        });
        clearPersistedQueryCache();
        window.localStorage.setItem(
          "selected-workspace-id",
          requestedWorkspaceId,
        );
        announceSelectedWorkspaceChange();
      })
      .catch(() => {
        if (active) setDeniedTarget(requestedWorkspaceId);
      });
    return () => {
      active = false;
    };
  }, [
    deniedTarget,
    needsSwitch,
    queryClient,
    requestedWorkspaceId,
    selectedWorkspaceId,
  ]);

  if (deniedTarget === requestedWorkspaceId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100">
        <div className="max-w-sm rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 text-center">
          <h1 className="text-lg font-semibold">
            Workspace access unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            You do not have access to the workspace for this notification.
          </p>
          <Button className="mt-5" onClick={() => router.replace("/")}>
            Return to workspace
          </Button>
        </div>
      </main>
    );
  }
  if (needsSwitch) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-300">
        Switching workspace…
      </main>
    );
  }
  return children;
}
