"use client";
import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrmManualInstagramWorkflow } from "@telegram-system/shared";
import {
  crmManualApi,
  crmManualKeys,
  crmManualPolicy,
  createManualOperationId,
} from "@/lib/features/growth/crm-manual-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
export function useManualWorkflow(workspace: string, contactId: string) {
  const client = useQueryClient();
  const receipt = useRef<{ fingerprint: string; id: string } | null>(null);
  const busy = useRef(false);
  const query = useQuery({
    queryKey: crmManualKeys.workflow(workspace, contactId),
    queryFn: ({ signal }) =>
      crmManualApi.workflow(contactId, undefined, signal),
    enabled: !!workspace && !!contactId,
    ...crmManualPolicy,
  });
  const mutation = useMutation({
    mutationFn: (action: () => Promise<CrmManualInstagramWorkflow>) => action(),
    retry: false,
    onSuccess: async (view) => {
      await client.cancelQueries({
        queryKey: crmManualKeys.workflow(workspace, contactId),
        exact: true,
      });
      client.setQueryData(crmManualKeys.workflow(workspace, contactId), view);
      void client.invalidateQueries({
        queryKey: crmManualKeys.lists(workspace),
      });
      void client.invalidateQueries({
        queryKey: telegramCrmKeys.contactDetail(contactId),
        exact: true,
      });
      void client.invalidateQueries({
        queryKey: telegramCrmKeys.contactTasks(contactId),
        exact: true,
      });
    },
  });
  const run = async (
    fingerprint: string,
    action: (operationId: string) => Promise<CrmManualInstagramWorkflow>,
  ) => {
    if (busy.current) return;
    busy.current = true;
    if (receipt.current?.fingerprint !== fingerprint)
      receipt.current = { fingerprint, id: createManualOperationId() };
    const id = receipt.current.id;
    try {
      await mutation.mutateAsync(() => action(id));
      receipt.current = null;
    } finally {
      busy.current = false;
    }
  };
  return { query, mutation, run };
}
