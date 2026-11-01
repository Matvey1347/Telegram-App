"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CrmCopilotDraft,
  CrmCopilotDraftPatch,
} from "@telegram-system/shared";
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
  const [changed, setChanged] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const epoch = useRef(0);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const lastOperation = useRef<string | null>(null);
  const drafts = useQuery({
    queryKey: copilotKeys.drafts(workspace, conversation),
    queryFn: ({ signal }) => crmCopilotApi.list(conversation, signal),
    enabled: open,
    ...copilotQueryPolicy,
    staleTime: 0,
  });
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const watched = [
      telegramCrmKeys.messagesInfinite(conversation),
      telegramCrmKeys.salesWorkflow(conversation),
      telegramCrmKeys.packageSalesContext(),
      ...(contactId
        ? [
            telegramCrmKeys.contactDetail(contactId),
            telegramCrmKeys.chatContext(contactId),
          ]
        : []),
    ];
    const data = new Map(
      watched.map((key) => [JSON.stringify(key), client.getQueryData(key)]),
    );
    return client.getQueryCache().subscribe((event) => {
      const key = JSON.stringify(event.query.queryKey);
      if (
        event.type !== "updated" ||
        event.action.type !== "success" ||
        !data.has(key) ||
        data.get(key) === event.query.state.data
      )
        return;
      data.set(key, event.query.state.data);
      epoch.current += 1;
      setChanged(true);
      void client.invalidateQueries({
        queryKey: copilotKeys.drafts(workspace, conversation),
        refetchType: "active",
      });
    });
  }, [client, conversation, contactId, workspace, open]);
  const generation = useMutation({
    retry: false,
    mutationFn: async (operationId: string) => {
      const started = epoch.current;
      abort.current = new AbortController();
      const result = await crmCopilotApi.suggest(
        conversation,
        { operationId },
        abort.current.signal,
      );
      return { result, started };
    },
    onSuccess: async ({ result, started }) => {
      const stale = started !== epoch.current;
      setChanged(stale);
      await patchCopilotDraft(
        client,
        stale &&
          ["READY", "APPROVED", "REVIEW_REQUIRED"].includes(result.status)
          ? { ...result, status: "STALE" }
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
        stale && result.status === "APPROVED"
          ? { ...result, status: "STALE" }
          : result,
      );
      setChanged(stale);
    },
  });
  const generate = async (retry = false) => {
    if (busy.current || generation.isPending) return;
    const operation = retry
      ? lastOperation.current
      : `${new Date().toISOString().slice(0, 10)}:${crypto.randomUUID()}`;
    if (!operation) return;
    busy.current = true;
    lastOperation.current = operation;
    setCanRetry(true);
    setOpen(true);
    try {
      await generation.mutateAsync(operation);
    } catch {
      /* The caller sees a retryable state; never retry paid work automatically. */
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
      return response.started === epoch.current ? response.result : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    open,
    setOpen,
    drafts,
    changed,
    generation,
    update,
    generate,
    patch,
    canRetry,
    cancel: () => abort.current?.abort(),
  };
}
