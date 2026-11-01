"use client";
import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CrmCopilotDraft,
  CrmCopilotDraftPatch,
  CrmCopilotGenerateInput,
} from "@telegram-system/shared";
import { crmSalesWorkflowApi } from "@/lib/features/growth/crm-sales-workflow-api";
import { crmCopilotApi } from "@/lib/features/growth/crm-copilot-api";
import {
  copilotKeys,
  copilotQueryPolicy,
  patchCopilotDraft,
} from "@/lib/features/growth/crm-copilot-query";
import { aiKeys } from "@/lib/features/operations/ai-query-keys";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
export function useCrmCopilot(
  workspace: string,
  conversation: string,
  contactId: string | null,
) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [details, setDetails] = useState(false);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [changed, setChanged] = useState(false);
  const epoch = useRef(0);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const lastRequest = useRef<CrmCopilotGenerateInput | null>(null);
  const drafts = useQuery({
    queryKey: copilotKeys.drafts(workspace, conversation),
    queryFn: ({ signal }) => crmCopilotApi.list(conversation, signal),
    enabled: open,
    ...copilotQueryPolicy,
    staleTime: 0,
  });
  const context = useQuery({
    queryKey: copilotKeys.context(
      workspace,
      conversation,
      productIds,
      includeNotes,
    ),
    queryFn: ({ signal }) =>
      crmCopilotApi.context(conversation, productIds, includeNotes, signal),
    enabled: open && (prepared || details),
    ...copilotQueryPolicy,
  });
  const catalog = useInfiniteQuery({
    queryKey: copilotKeys.catalog(workspace),
    queryFn: ({ pageParam, signal }) =>
      crmSalesWorkflowApi.packages(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : undefined),
    enabled: open && prepared,
    ...copilotQueryPolicy,
  });
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const watched = [
      telegramCrmKeys.messagesInfinite(conversation),
      telegramCrmKeys.salesWorkflow(conversation),
      telegramCrmKeys.packageSalesContext(),
      ...(contactId ? [telegramCrmKeys.contactDetail(contactId)] : []),
    ].map((v) => JSON.stringify(v));
    return client.getQueryCache().subscribe((event) => {
      if (
        event.type !== "updated" ||
        event.action.type !== "success" ||
        !watched.includes(JSON.stringify(event.query.queryKey))
      )
        return;
      epoch.current += 1;
      setChanged(true);
      void client.invalidateQueries({
        queryKey: copilotKeys.root(workspace, conversation),
        refetchType: "active",
      });
    });
  }, [client, conversation, contactId, workspace, open]);
  const generation = useMutation({
    retry: false,
    mutationFn: async (input: CrmCopilotGenerateInput) => {
      const started = epoch.current;
      abort.current = new AbortController();
      const result = await crmCopilotApi.generate(
        conversation,
        input,
        abort.current.signal,
      );
      return { result, started };
    },
    onSuccess: async ({ result, started }) => {
      const stale = started !== epoch.current;
      setChanged(stale);
      await patchCopilotDraft(
        client,
        stale
          ? {
              ...result,
              status: "STALE",
              warnings: [
                ...result.warnings,
                "Context changed during generation. Review again.",
              ],
            }
          : result,
      );
    },
    onSettled: () => {
      void client.invalidateQueries({
        queryKey: aiKeys.analytics(workspace),
        refetchType: "active",
      });
      busy.current = false;
      abort.current = null;
    },
  });
  const update = useMutation({
    retry: false,
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: CrmCopilotDraftPatch;
    }) => {
      const started = epoch.current;
      const result = await crmCopilotApi.update(conversation, id, patch);
      return { result, started };
    },
    onSuccess: async ({ result, started }) => {
      const stale = started !== epoch.current;
      await patchCopilotDraft(
        client,
        stale ? { ...result, status: "STALE" } : result,
      );
      setChanged(stale);
    },
  });
  const generate = async (
    input: Omit<CrmCopilotGenerateInput, "operationId">,
    retry = false,
  ) => {
    if (busy.current || generation.isPending || !context.data?.canGenerate)
      return;
    busy.current = true;
    const request = retry
      ? lastRequest.current
      : {
          ...input,
          operationId: `${new Date().toISOString().slice(0, 10)}:${crypto.randomUUID()}`,
        };
    if (!request) {
      busy.current = false;
      return;
    }
    lastRequest.current = request;
    setCanRetry(true);
    try {
      await generation.mutateAsync(request);
    } catch {
      /* Show uncertainty; no hidden retry. */
    }
  };
  const patch = async (
    draft: CrmCopilotDraft,
    action: CrmCopilotDraftPatch["action"],
    text?: string,
  ) => {
    if (update.isPending) return;
    try {
      const response = await update.mutateAsync({
        id: draft.id,
        patch: {
          revision: draft.revision,
          action,
          ...(text === undefined ? {} : { text }),
        },
      });
      return response.result;
    } catch {
      return undefined;
    }
  };
  return {
    open,
    setOpen,
    details,
    setDetails,
    prepared,
    setPrepared,
    productIds,
    setProductIds,
    includeNotes,
    setIncludeNotes,
    drafts,
    context,
    changed,
    generation,
    update,
    generate,
    patch,
    cancel: () => abort.current?.abort(),
    canRetry,
    catalog,
  };
}
