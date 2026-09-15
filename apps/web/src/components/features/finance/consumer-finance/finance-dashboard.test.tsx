import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  it("keeps the overview limited to the requested compact sections", () => {
    render(<FinanceDashboard data={dashboard} locale="ru" surface="browser" />);

    expect(screen.getByText("Балансы по счетам")).toBeInTheDocument();
    expect(screen.queryByText("Последние операции")).toBeNull();
    expect(screen.queryByText("Расходы за месяц")).toBeNull();
    expect(screen.queryByText("Бюджет")).toBeNull();
  });

  it("does not decorate the expense summary with a minus icon", () => {
    const { container } = render(
      <FinanceDashboard data={dashboard} locale="en" surface="telegram" />,
    );

    expect(container.querySelector(".lucide-circle-minus")).toBeNull();
  });

  it("keeps period controls and the custom range visible over the content skeleton", () => {
    render(
      <FinanceDashboard
        data={null}
        locale="ru"
        surface="browser"
        period={{
          period: "CUSTOM",
          from: "2026-09-01",
          to: "2026-09-09",
        }}
        loading
        loadingLabel="Загрузка финансов..."
      />,
    );

    expect(screen.getByRole("button", { name: "Этот месяц" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Период аналитики" }),
    ).toHaveTextContent("01.09.2026 - 09.09.2026");
    expect(
      document.querySelector("[data-finance-dashboard-skeleton]"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-feedback='loading']"),
    ).not.toBeInTheDocument();
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
        surface="telegram"
      />,
    );
    expect(screen.getByText("💳")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add expense" })).toBeNull();
  });

  it("keeps missing investment valuations out of the dashboard warning", () => {
    render(
      <FinanceDashboard
        data={{
          ...dashboard,
          stats: {
            ...dashboard.stats,
            netWorth: {
              ...dashboard.stats.netWorth,
              complete: false,
              excludedInvestmentCount: 1,
            },
          },
          investments: {
            ...dashboard.investments,
            excludedInvestments: [
              {
                investmentId: "investment",
                name: "Business",
                currency: "USD",
                invested: "100",
                returned: "0",
                currentValue: "0",
                reason: "VALUATION_MISSING",
              },
            ],
          },
        }}
        locale="en"
        surface="telegram"
      />,
    );

    expect(
      screen.queryByText(/current exchange rates are unavailable/u),
    ).toBeNull();
    expect(screen.queryByText(/current valuation/u)).toBeNull();
  });
});
