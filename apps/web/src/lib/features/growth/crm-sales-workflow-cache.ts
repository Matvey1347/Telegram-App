import type { QueryClient } from "@tanstack/react-query";
import { deriveCrmSalesAttention, type CrmInboxConversationItem, type CrmManualSalesStatus, type CrmSalesWorkflow } from "@telegram-system/shared";
import { findInboxConversation, patchInboxConversation, type CrmInboxData } from "./crm-inbox-cache";
import { telegramCrmKeys } from "./telegram-crm-query";

export function inboxSalesAttention(item: Pick<CrmInboxConversationItem, "state" | "contact" | "lastInboundAt" | "lastOutboundAt">) {
  return deriveCrmSalesAttention({ state: item.state, archivedAt: item.contact?.archivedAt,
    manualStatus: item.contact?.manualSalesStatus, nextContactAt: item.contact?.nextContactAt ?? null,
    lastInboundAt: item.lastInboundAt, lastOutboundAt: item.lastOutboundAt });
}

export function patchInboxContactSales(client: QueryClient, contactId: string, facts: {
  manualSalesStatus?: CrmManualSalesStatus | null;
  nextContactAt?: string | null;
  archivedAt?: string | null;
}) {
  const unique = new Map(client.getQueriesData<CrmInboxData>({ queryKey: telegramCrmKeys.inboxConversations() })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? [])
    .filter((item) => item.contact?.id === contactId).map((item) => [item.id, item]));
  for (const item of unique.values()) {
    const contact = { ...item.contact!, ...facts };
    patchInboxConversation(client, item.id, { contact, attentionStatus: inboxSalesAttention({ ...item, contact }) });
  }
  return unique.size > 0;
}

export function reconcileCrmSalesWorkflow(client: QueryClient, workflow: CrmSalesWorkflow) {
  client.setQueryData(telegramCrmKeys.salesWorkflow(workflow.conversationId), workflow);
  if (workflow.contactId) patchInboxContactSales(client, workflow.contactId, {
    manualSalesStatus: workflow.manualStatus,
    nextContactAt: workflow.nextContactAt,
  });
  const known = findInboxConversation(client, workflow.conversationId);
  if (known) patchInboxConversation(client, workflow.conversationId, { attentionStatus: workflow.attentionStatus });
  if (workflow.contactId) {
    // Compact contact UI shares the authoritative reminder date; purchase data is untouched.
    client.setQueryData(telegramCrmKeys.contactDetail(workflow.contactId), (current: Record<string, unknown> | undefined) =>
      current ? { ...current, nextContactAt: workflow.nextContactAt } : current);
    void client.invalidateQueries({ queryKey: telegramCrmKeys.contactTasks(workflow.contactId), refetchType: "active" });
  }
}
