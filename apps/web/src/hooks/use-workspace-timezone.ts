"use client";

import { useAuth } from "@/hooks/use-auth";

/** The timezone used to present workspace-owned instants throughout the UI. */
export function useWorkspaceTimezone() {
  const { workspace } = useAuth();
  return workspace?.timezone || "Europe/Warsaw";
}
