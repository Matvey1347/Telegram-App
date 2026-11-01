import type { AiUsageFilter } from "@telegram-system/shared";
export const aiKeys = {
  configuration: (workspaceId: string) =>
    ["operations", "ai", workspaceId, "configuration"] as const,
  analytics: (workspaceId: string) =>
    ["operations", "ai", workspaceId, "analytics"] as const,
  usageRoot: (workspaceId: string) =>
    [...aiKeys.analytics(workspaceId), "usage"] as const,
  usage: (workspaceId: string, filter: AiUsageFilter) =>
    [...aiKeys.usageRoot(workspaceId), filter] as const,
  operations: (workspaceId: string, filter: AiUsageFilter) =>
    [...aiKeys.analytics(workspaceId), "operations", filter] as const,
};
export const aiQueryPolicy = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;
