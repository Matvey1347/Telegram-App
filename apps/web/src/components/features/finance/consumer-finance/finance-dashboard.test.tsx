import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceDashboard } from "@telegram-system/shared";
import { FinanceDashboard } from "./finance-dashboard";

const dashboard: ConsumerFinanceDashboard = {
  profile: {
    id: "profile-1",
    defaultCurrency: "USD",
    timezone: "UTC",
    locale: "en",
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
    categories: [],
    accounts: [],
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

describe("FinanceDashboard actions", () => {
  it("does not decorate the expense summary with a minus icon", () => {
    const { container } = render(
      <FinanceDashboard
        data={dashboard}
        locale="en"
        timezone="UTC"
        onNavigate={vi.fn()}
        surface="telegram"
      />,
    );

    expect(container.querySelector(".lucide-circle-minus")).toBeNull();
  });

  it("uses the hydrated account presentation without an icon request", () => {
    render(
      <FinanceDashboard
        data={{
          ...dashboard,
          stats: {
            ...dashboard.stats,
            totalBalance: {
              ...dashboard.stats.totalBalance,
              includedAccountCount: 1,
            },
            accounts: [
              {
                id: "account",
                name: "Daily card",
                iconPresentation: { type: "unicode", value: "💳" },
                type: "CARD",
                currency: "USD",
                openingBalance: "0",
                balance: "10",
                defaultCurrency: "USD",
              },
            ],
          },
        }}
        locale="en"
        timezone="UTC"
        onNavigate={vi.fn()}
        surface="telegram"
      />,
    );
    expect(screen.getByText("💳")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add expense" })).toBeNull();
  });
});
