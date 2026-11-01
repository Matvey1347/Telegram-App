import type {
  CrmManualContactsFilter,
  CrmManualContactsPage,
  CrmManualInstagramWorkflow,
  CrmManualContactCreateInput,
  CrmInstagramMethodInput,
  CrmManualActivityInput,
  CrmManualFollowUpInput,
  CrmFollowUpActionInput,
} from "@telegram-system/shared";
import { api } from "@/lib/api";
const root = "/telegram-crm/manual-contacts";
const path = (id: string) => `${root}/${encodeURIComponent(id)}`;
export const crmManualApi = {
  async list(params: CrmManualContactsFilter, signal?: AbortSignal) {
    return (await api.get<CrmManualContactsPage>(root, { params, signal }))
      .data;
  },
  async create(input: CrmManualContactCreateInput) {
    return (await api.post<CrmManualInstagramWorkflow>(root, input)).data;
  },
  async workflow(id: string, cursor?: string, signal?: AbortSignal) {
    return (
      await api.get<CrmManualInstagramWorkflow>(`${path(id)}/workflow`, {
        params: { cursor, limit: 20 },
        signal,
      })
    ).data;
  },
  async addInstagram(id: string, input: CrmInstagramMethodInput) {
    return (
      await api.post<CrmManualInstagramWorkflow>(`${path(id)}/instagram`, input)
    ).data;
  },
  async updateInstagram(
    id: string,
    method: string,
    input: CrmInstagramMethodInput,
  ) {
    return (
      await api.patch<CrmManualInstagramWorkflow>(
        `${path(id)}/instagram/${encodeURIComponent(method)}`,
        input,
      )
    ).data;
  },
  async activity(id: string, input: CrmManualActivityInput) {
    return (
      await api.post<CrmManualInstagramWorkflow>(
        `${path(id)}/activities`,
        input,
      )
    ).data;
  },
  async schedule(id: string, input: CrmManualFollowUpInput) {
    return (
      await api.post<CrmManualInstagramWorkflow>(`${path(id)}/follow-up`, input)
    ).data;
  },
  async followUp(id: string, task: string, input: CrmFollowUpActionInput) {
    return (
      await api.patch<CrmManualInstagramWorkflow>(
        `${path(id)}/follow-up/${encodeURIComponent(task)}`,
        input,
      )
    ).data;
  },
};
export const crmManualKeys = {
  lists: (workspace: string) => ["crm-manual", workspace, "list"] as const,
  list: (workspace: string, filter: CrmManualContactsFilter) =>
    ["crm-manual", workspace, "list", filter] as const,
  workflow: (workspace: string, id: string) =>
    ["crm-manual", workspace, "workflow", id] as const,
};
export const crmManualPolicy = {
  staleTime: 60000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  retry: false,
} as const;
export function createManualOperationId() {
  return `${new Date().toISOString().slice(0, 10)}:${crypto.randomUUID()}`;
}
