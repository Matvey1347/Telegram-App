import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConsumerFinanceAnalytics } from "@telegram-system/shared";
import { AnalyticsPresentation } from "./finance-analytics-presentation";

const analytics: ConsumerFinanceAnalytics = {
  currency: "USD",
  period: { period: "CURRENT_MONTH", from: "2026-08-01", to: "2026-08-31" },
  summary: {
    income: "100",
    expenses: "40",
    saved: "10",
    invested: "20",
    investmentReturns: "5",
    netCashflow: "45",
  },
  comparison: {
    period: { from: "2026-07-01", to: "2026-08-01" },
    summary: {
      income: "80",
      expenses: "50",
      saved: "5",
      invested: "10",
      investmentReturns: "2",
      netCashflow: "22",
    },
  },
  expensesByCategory: [],
  incomeByCategory: [],
  accounts: [],
  timeline: [],
  trends: [
    {
      metric: "INCOME",
      direction: "UP",
      current: "100",
      previous: "80",
      changePercent: 25,
    },
  ],
  legacyFallback: {
    transactionCount: 2,
    nativeAmounts: [
      { currency: "UAH", amount: "1000" },
      { currency: "EUR", amount: "10" },
    ],
    reason: "UNKNOWN_HISTORICAL_DEFAULT_CURRENCY",
  },
  savings: {
    currency: "USD",
    allocated: "10",
    backed: "10",
    activeGoals: 1,
    completedGoals: 0,
    underfundedGoals: 0,
    excludedGoals: [],
  },
  investments: {
    currency: "USD",
    totalInvested: "20",
    totalReturned: "5",
    currentValue: "18",
    profitLoss: "3",
    returnPercentage: 15,
    activeInvestments: 1,
    closedInvestments: 0,
    excludedInvestments: [],
  },
  netWorth: {
    amount: "118",
    currency: "USD",
    cashAmount: "100",
    investmentValue: "18",
    complete: true,
    excludedAccountCount: 0,
    excludedInvestmentCount: 0,
  },
};

describe("AnalyticsPresentation", () => {
  it("does not decorate the expense summary with a minus icon", () => {
    const { container } = render(<AnalyticsPresentation data={analytics} />);

    expect(container.querySelector(".lucide-circle-minus")).toBeNull();
  });

  it("makes pre-valuation native amounts visible without presenting them as current totals", () => {
    render(<AnalyticsPresentation data={analytics} />);

    expect(screen.getByRole("note")).toHaveTextContent(
      "not included in these totals",
    );
    expect(
      screen.getByLabelText("Historical native currency amounts"),
    ).toHaveTextContent("₴");
    expect(
      screen.getByLabelText("Historical native currency amounts"),
    ).toHaveTextContent("€");
    expect(screen.getByText("Income").parentElement).toHaveTextContent(
      "$ 100.00",
    );
  });
});
