import type { CrmFollowUpActionInput, CrmPackageSalesContext, CrmPurchasesPage, CrmSalesStatusInput, CrmSalesWorkflow, CrmScheduleFollowUpInput } from "@telegram-system/shared";
import { api } from "@/lib/api";

const conversationPath = (id: string) => `/telegram-crm/conversations/${encodeURIComponent(id)}`;
export const crmSalesWorkflowApi = {
  async get(conversationId: string, signal?: AbortSignal) {
    return (await api.get<CrmSalesWorkflow>(`${conversationPath(conversationId)}/sales-workflow`, { signal })).data;
  },
  async setStatus(conversationId: string, input: CrmSalesStatusInput) {
    return (await api.patch<CrmSalesWorkflow>(`${conversationPath(conversationId)}/sales-workflow`, input)).data;
  },
  async schedule(conversationId: string, input: CrmScheduleFollowUpInput) {
    return (await api.post<CrmSalesWorkflow>(`${conversationPath(conversationId)}/follow-up`, input)).data;
  },
  async followUpAction(conversationId: string, taskId: string, input: CrmFollowUpActionInput) {
    return (await api.patch<CrmSalesWorkflow>(`${conversationPath(conversationId)}/follow-up/${encodeURIComponent(taskId)}`, input)).data;
  },
  async purchases(contactId: string, cursor: string | null, signal?: AbortSignal) {
    return (await api.get<CrmPurchasesPage>(`/telegram-crm/contacts/${encodeURIComponent(contactId)}/purchases`, { params: { cursor: cursor || undefined, limit: 20 }, signal })).data;
  },
  async packages(cursor: string | null, signal?: AbortSignal) {
    return (await api.get<CrmPackageSalesContext>("/telegram-crm/package-sales-context", { params: { cursor: cursor || undefined, limit: 20 }, signal })).data;
  },
};
