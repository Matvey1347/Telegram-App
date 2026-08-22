import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceOverviewSection } from "./finance-overview-section";

const overview = vi.hoisted(() => vi.fn());
vi.mock("@/lib/features/finance/bot-billing-api", () => ({ botBillingApi: { overview } }));

describe("FinanceOverviewSection AI cost", () => {
  it("renders model and user cost for the selected runtime", async () => {
    overview.mockResolvedValue({
      analytics: { registeredUsers: 1, paidUsers: 1, activeSubscriptions: 1, failedPayments: 0, freeUsers: 0, canceled: 0, monthly: 1, yearly: 0, mrr: [], collectedRevenue: [], conversionRate: 1 },
      aiUsage: { periodStart: "2026-08-01T00:00:00.000Z", requests: 3, inputTokens: 1200, cachedInputTokens: 200, outputTokens: 100, estimatedCostMicros: 5000, unpricedRequests: 0, byModel: [{ model: "gpt-5-mini", requests: 3, inputTokens: 1200, outputTokens: 100, estimatedCostMicros: 5000 }], byUser: [{ telegramBotUserId: "user-1", telegramUserId: "42", username: "alice", firstName: "Alice", requests: 3, estimatedCostMicros: 5000 }] },
      recentActivity: [],
    });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FinanceOverviewSection botId="bot-1" environment="LOCAL" /></QueryClientProvider>);
    expect(await screen.findByText("AI usage · current month")).toBeInTheDocument();
    expect(screen.getByText("gpt-5-mini")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(overview).toHaveBeenCalledWith("bot-1", "LOCAL");
  });
});
