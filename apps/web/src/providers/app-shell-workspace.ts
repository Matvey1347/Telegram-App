"use client";

import { createContext, useContext } from "react";

export const AppShellWorkspaceContext = createContext<{
  workspaceId: string;
  availableWorkspaces: readonly { id: string }[];
  onSwitchWorkspace: (id: string) => Promise<void>;
} | null>(null);

export function useAppShellWorkspace() {
  return useContext(AppShellWorkspaceContext);
}
