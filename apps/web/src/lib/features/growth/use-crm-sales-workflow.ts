"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmFollowUpActionInput, CrmSalesStatusInput, CrmScheduleFollowUpInput } from "@telegram-system/shared";
import { crmSalesWorkflowApi } from "./crm-sales-workflow-api";
import { reconcileCrmSalesWorkflow } from "./crm-sales-workflow-cache";
import { telegramCrmKeys } from "./telegram-crm-query";

export function useCrmSalesWorkflow(conversationId: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: telegramCrmKeys.salesWorkflow(conversationId),
    queryFn: ({ signal }) => crmSalesWorkflowApi.get(conversationId, signal),
    staleTime: 60_000,
  });
  const pending = useIsMutating({ mutationKey: telegramCrmKeys.salesWorkflow(conversationId) }) > 0;
  const mutation = useMutation({
    mutationKey: telegramCrmKeys.salesWorkflow(conversationId),
    mutationFn: (command: { kind: "status"; input: CrmSalesStatusInput } | { kind: "schedule"; input: CrmScheduleFollowUpInput } |
      { kind: "followUp"; taskId: string; input: CrmFollowUpActionInput }) => {
      if (command.kind === "status") return crmSalesWorkflowApi.setStatus(conversationId, command.input);
      if (command.kind === "schedule") return crmSalesWorkflowApi.schedule(conversationId, command.input);
      return crmSalesWorkflowApi.followUpAction(conversationId, command.taskId, command.input);
    },
    onMutate: () => client.cancelQueries({ queryKey: telegramCrmKeys.salesWorkflow(conversationId), exact: true }),
    onSuccess: (workflow) => reconcileCrmSalesWorkflow(client, workflow),
  });
  return { ...query, mutation, pending };
}
