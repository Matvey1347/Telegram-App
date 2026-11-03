import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { dashboardKeys } from "@/lib/query-keys";
import { invalidateFinanceDashboardSummary } from "./finance-dashboard-cache";

describe("finance dashboard cache invalidation", () => {
  it("invalidates the dashboard root so all cached periods refresh after finance writes", async () => {
    const client = new QueryClient();
    const currentPeriod = dashboardKeys.summary("month", "2026-11-01", "2026-11-30");
    const historicalPeriod = dashboardKeys.summary("custom", "2026-01-01", "2026-01-31");
    client.setQueryData(currentPeriod, { income: 10 });
    client.setQueryData(historicalPeriod, { income: 20 });

    await invalidateFinanceDashboardSummary(client);

    expect(client.getQueryState(currentPeriod)?.isInvalidated).toBe(true);
    expect(client.getQueryState(historicalPeriod)?.isInvalidated).toBe(true);
    client.clear();
  });
});
