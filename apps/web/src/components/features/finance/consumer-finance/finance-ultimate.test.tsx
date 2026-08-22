import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { FinanceUltimate } from "./finance-ultimate";

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: {
    entitlements: vi.fn(),
    ultimateOverview: vi.fn(),
    ultimateAnalytics: vi.fn(),
    askFinance: vi.fn(),
  },
}));

function renderUltimate() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FinanceUltimate botId="bot" locale="en" onUpgrade={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumerFinanceApi.entitlements).mockResolvedValue({
    tier: "ULTIMATE",
    capabilities: ["DEEP_ANALYTICS"],
    usage: [],
    activeUntil: null,
    cancelAtPeriodEnd: false,
  });
  vi.mocked(consumerFinanceApi.ultimateOverview).mockResolvedValue({
    currency: "USD",
    balance: "100",
    balanceSummary: {
      amount: "100",
      currency: "USD",
      includedAccountCount: 1,
      excludedAccounts: [],
    },
    forecast: {
      expectedIncome: "25",
      expectedExpenses: "10",
      projectedBalance: "115",
      through: "2026-09-01",
    },
    insights: [],
    anomalies: [],
  });
  vi.mocked(consumerFinanceApi.ultimateAnalytics).mockResolvedValue({
    currency: "USD",
    period: { from: "2026-01-01", to: "2026-08-21" },
    categories: [],
    merchants: [],
    accounts: [],
    trend: [{ date: "2026-08", amount: "9", transactionCount: 1 }],
    items: {
      currency: "USD",
      availablePurchaseCount: 0,
      totalPurchaseCount: 0,
      rows: [],
    },
  });
  vi.mocked(consumerFinanceApi.askFinance).mockResolvedValue({
    answer: "Grounded answer",
    facts: [],
    suggestedQuestions: ["How much did I spend?"],
  });
});

describe("FinanceUltimate", () => {
  it("renders forecast income, trend and actionable suggested questions", async () => {
    renderUltimate();

    expect(await screen.findByText("Expected income")).toBeInTheDocument();
    expect(await screen.findByText("2026-08: 9.00 USD")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ask about your spending history"), {
      target: { value: "Show my history" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    const suggestion = await screen.findByRole("button", {
      name: "How much did I spend?",
    });
    fireEvent.click(suggestion);
    expect(screen.getByLabelText("Ask about your spending history")).toHaveValue(
      "How much did I spend?",
    );
  });

  it("shows retry instead of a fake paywall when entitlements fail", async () => {
    vi.mocked(consumerFinanceApi.entitlements).mockRejectedValue(
      new Error("offline"),
    );
    renderUltimate();

    expect(
      await screen.findByText("Could not load Ultimate intelligence."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View plans" })).not.toBeInTheDocument();
  });
});
