import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConsumerFinanceAnalytics } from "@telegram-system/shared";
import { AnalyticsPresentation } from "./finance-analytics";

const analytics: ConsumerFinanceAnalytics = {
  currency: "USD",
  period: { period: "CURRENT_MONTH", from: "2026-08-01", to: "2026-08-31" },
  summary: { income: "100", expenses: "40", netCashflow: "60" },
  expensesByCategory: [],
  timeline: [],
  legacyFallback: {
    transactionCount: 2,
    nativeAmounts: [
      { currency: "UAH", amount: "1000" },
      { currency: "EUR", amount: "10" },
    ],
    reason: "UNKNOWN_HISTORICAL_DEFAULT_CURRENCY",
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
