import { useQuery } from "@tanstack/react-query";
import { consumerFinancePlanningApi } from "@finance-pro/web/lib/api/consumer-finance-planning-api";
import { consumerFinanceKeys } from "@finance-pro/web/lib/query/consumer-finance-query-keys";

export function useFinanceEntitlements(botId: string, enabled = true) {
  return useQuery({
    queryKey: consumerFinanceKeys.entitlements(botId),
    queryFn: () => consumerFinancePlanningApi.entitlements(botId),
    enabled,
    staleTime: 60_000,
  });
}
