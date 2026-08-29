import type { AxiosInstance } from "axios";
import type { DashboardSummary } from "../../api-types";

export function createDashboardApi(api: AxiosInstance) {
  return {
    getSummary: async (params?: { dateFrom?: string; dateTo?: string }) =>
      (await api.get<DashboardSummary>("/dashboard/summary", { params })).data,
  };
}
