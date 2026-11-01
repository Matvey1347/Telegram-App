import type {
  CrmCopilotDraft,
  CrmCopilotDrafts,
} from "@telegram-system/shared";
import type { QueryClient } from "@tanstack/react-query";
export const copilotKeys = {
  catalog: (workspace: string) =>
    [
      "telegram-crm",
      "package-sales-context",
      workspace,
      "copilot-choices",
    ] as const,
  root: (workspace: string, conversation: string) =>
    ["telegram-crm", "copilot", workspace, conversation] as const,
  drafts: (workspace: string, conversation: string) =>
    [...copilotKeys.root(workspace, conversation), "drafts"] as const,
  context: (
    workspace: string,
    conversation: string,
    products: string[],
    notes: boolean,
  ) =>
    [
      ...copilotKeys.root(workspace, conversation),
      "context",
      [...products].sort(),
      notes,
    ] as const,
};
export async function patchCopilotDraft(
  client: QueryClient,
  draft: CrmCopilotDraft,
) {
  const key = copilotKeys.drafts(draft.workspaceId, draft.conversationId);
  await client.cancelQueries({ queryKey: key, exact: true });
  client.setQueryData<CrmCopilotDrafts>(
    copilotKeys.drafts(draft.workspaceId, draft.conversationId),
    (old) =>
      old?.items.some((v) => v.id === draft.id && v.revision > draft.revision)
        ? old
        : {
            items: [
              draft,
              ...(old?.items ?? []).filter((v) => v.id !== draft.id),
            ].slice(0, 5),
          },
  );
}
export const copilotQueryPolicy = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;
