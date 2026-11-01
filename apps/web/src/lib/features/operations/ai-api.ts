import type {
  AiCategory,
  AiCategoryConfigurationPatch,
  AiConfiguration,
  AiOperationsPage,
  AiOperationsFilter,
  AiOperationView,
  AiReconciliationInput,
  AiUsageDashboard,
  AiUsageFilter,
  AiWorkspaceConfigurationPatch,
} from "@telegram-system/shared";
import { api } from "@/lib/api";

export const aiApi = {
  configuration: async () =>
    (await api.get<AiConfiguration>("/operations/ai/config")).data,
  updateWorkspace: async (body: AiWorkspaceConfigurationPatch) =>
    (await api.patch<AiConfiguration>("/operations/ai/config", body)).data,
  updateCategory: async (
    category: AiCategory,
    body: AiCategoryConfigurationPatch,
  ) =>
    (
      await api.patch<AiConfiguration>(
        `/operations/ai/categories/${category}`,
        body,
      )
    ).data,
  usage: async (params: AiUsageFilter) =>
    (await api.get<AiUsageDashboard>("/operations/ai/usage", { params })).data,
  operations: async (
    params: AiOperationsFilter & { cursor?: string; limit?: number },
  ) =>
    (await api.get<AiOperationsPage>("/operations/ai/operations", { params }))
      .data,
  reconcile: async (id: string, body: AiReconciliationInput) =>
    (
      await api.post<AiOperationView>(
        `/operations/ai/operations/${encodeURIComponent(id)}/reconcile`,
        body,
      )
    ).data,
};
