import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceDashboard } from "@telegram-system/shared";
import { FinanceBudget } from "./finance-budget";

const api = vi.hoisted(() => ({
  dashboard: vi.fn(),
  categories: vi.fn(),
  limits: vi.fn(),
  smartLimits: vi.fn(),
}));

vi.mock("@/lib/features/finance/consumer-finance-insights-api", () => ({
  consumerFinanceInsightsApi: { dashboard: api.dashboard },
}));
vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: { categories: api.categories },
}));
vi.mock("@/lib/features/finance/consumer-finance-planning-api", () => ({
  consumerFinancePlanningApi: {
    limits: api.limits,
    smartLimits: api.smartLimits,
    saveLimit: vi.fn(),
  },
}));

const dashboard: ConsumerFinanceDashboard = {
  profile: {
    id: "profile",
    defaultCurrency: "USD",
    timezone: "UTC",
    locale: "en",
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    telegramUser: { displayName: "Ada", username: null, avatarUrl: null },
  },
  stats: {
    currency: "USD",
    income: "0",
    expense: "0",
    saved: "0",
    invested: "0",
    investmentReturns: "0",
    net: "0",
    netWorth: {
      amount: "0",
      currency: "USD",
      cashAmount: "0",
      investmentValue: "0",
      complete: true,
      excludedAccountCount: 0,
      excludedInvestmentCount: 0,
    },
    totalBalance: {
      amount: "0",
      currency: "USD",
      includedAccountCount: 0,
      excludedAccounts: [],
    },
    accounts: [],
    categories: [],
  },
  limits: [],
  savings: {
    currency: "USD",
    allocated: "0",
    backed: "0",
    activeGoals: 0,
    completedGoals: 0,
    underfundedGoals: 0,
    excludedGoals: [],
  },
  investments: {
    currency: "USD",
    totalInvested: "0",
    totalReturned: "0",
    currentValue: "0",
    profitLoss: "0",
    returnPercentage: null,
    activeInvestments: 0,
    closedInvestments: 0,
    excludedInvestments: [],
  },
  recent: [],
};

describe("FinanceBudget request graph", () => {
  it("starts dashboard, categories and smart limits together without a duplicate limits GET", async () => {
    let resolveDashboard!: (value: ConsumerFinanceDashboard) => void;
    let resolveCategories!: (value: []) => void;
    let resolveSmartLimits!: (value: []) => void;
    api.dashboard.mockReturnValue(
      new Promise((resolve) => {
        resolveDashboard = resolve;
      }),
    );
    api.categories.mockReturnValue(
      new Promise((resolve) => {
        resolveCategories = resolve;
      }),
    );
    api.smartLimits.mockReturnValue(
      new Promise((resolve) => {
        resolveSmartLimits = resolve;
      }),
    );

    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FinanceBudget botId="bot" locale="en" onUpgrade={vi.fn()} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(api.dashboard).toHaveBeenCalledOnce();
      expect(api.categories).toHaveBeenCalledOnce();
      expect(api.smartLimits).toHaveBeenCalledOnce();
    });
    expect(api.limits).not.toHaveBeenCalled();
    resolveDashboard(dashboard);
    resolveCategories([]);
    resolveSmartLimits([]);
    expect(await screen.findByText("Smart limits")).toBeInTheDocument();
  });
});
