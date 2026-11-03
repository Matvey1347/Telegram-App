import type { QueryClient } from "@tanstack/react-query";
import { dashboardKeys } from "@/lib/query-keys";

/** Marks every cached dashboard period stale after a finance write. */
export function invalidateFinanceDashboardSummary(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: dashboardKeys.summary() });
}
