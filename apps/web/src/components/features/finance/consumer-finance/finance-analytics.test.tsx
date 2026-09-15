import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    requiredExpenses: "25",
    discretionaryExpenses: "10",
    unspecifiedExpenses: "5",
    recurringExpenses: "15",
    oneOffExpenses: "25",
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
  expensesByCategory: [
    {
      categoryId: "food",
      categoryKey: "food",
      name: "Food",
      amount: "40",
      percentage: 100,
    },
  ],
  incomeByCategory: [],
  accounts: [
    {
      accountId: "cash",
      name: "Cash",
      iconPresentation: { type: "unicode", value: "💵" },
      income: "100",
      expenses: "40",
      invested: "0",
      investmentReturns: "0",
      netCashflow: "60",
    },
  ],
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
    expect(screen.getAllByText("Income")[0].parentElement).toHaveTextContent(
      "$ 100.00",
    );
  });

  it("renders compact composition charts for categories, priorities and recurring expenses", () => {
    render(<AnalyticsPresentation data={analytics} locale="en" />);

    expect(
      screen.getByRole("img", { name: "Expenses by category" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Required and optional expenses" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Recurring and one-off expenses" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Period remainder")).not.toHaveLength(0);
  });

  it("shows each account emoji in the account breakdown", () => {
    render(<AnalyticsPresentation data={analytics} locale="en" />);

    expect(screen.getByText("💵")).toBeInTheDocument();
    expect(screen.getByText("Cash")).toBeInTheDocument();
  });

  it("keeps donut arcs flush and shows the monetary value on hover", () => {
    render(<AnalyticsPresentation data={analytics} locale="en" />);

    const segment = screen.getByLabelText("Food: $ 40.00");
    fireEvent.mouseEnter(segment);

    expect(segment).toHaveAttribute("stroke-width", "7");
    expect(segment).not.toHaveAttribute("transform");
    expect(segment).not.toHaveStyle({ filter: expect.any(String) });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Food");
    expect(screen.getByRole("tooltip")).toHaveTextContent("$ 40.00");
  });

  it("keeps every donut tooltip at the same distance from its chart", () => {
    render(
      <AnalyticsPresentation
        data={{
          ...analytics,
          expensesByCategory: [
            ...analytics.expensesByCategory,
            {
              categoryId: "travel",
              categoryKey: "travel",
              name: "Travel",
              amount: "10",
              percentage: 20,
            },
          ],
        }}
        locale="en"
      />,
    );

    const food = screen.getByLabelText("Food: $ 40.00");
    const travel = screen.getByLabelText("Travel: $ 10.00");
    const donut = food.closest("div");
    expect(donut).not.toBeNull();
    vi.spyOn(donut!, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 100,
      top: 100,
      right: 292,
      bottom: 292,
      left: 100,
      width: 192,
      height: 192,
      toJSON: () => ({}),
    });

    fireEvent.mouseEnter(food);
    const firstTooltip = screen.getByRole("tooltip");
    const foodPosition = {
      left: firstTooltip.style.left,
      top: firstTooltip.style.top,
      transform: firstTooltip.style.transform,
    };
    expect(foodPosition).toEqual({
      left: "196px",
      top: "300px",
      transform: "translate(-50%, 0)",
    });
    fireEvent.mouseLeave(food);
    fireEvent.mouseEnter(travel);

    const secondTooltip = screen.getByRole("tooltip");
    expect({
      left: secondTooltip.style.left,
      top: secondTooltip.style.top,
      transform: secondTooltip.style.transform,
    }).toEqual(foodPosition);
  });

  it("shows all daily money movements when the chart date is hovered", () => {
    render(
      <AnalyticsPresentation
        locale="en"
        data={{
          ...analytics,
          timeline: [
            {
              date: "2026-08-05",
              income: "100",
              expenses: "40",
              saved: "10",
              invested: "20",
              investmentReturns: "0",
              debtRepayments: "5",
              netCashflow: "35",
            },
          ],
        }}
      />,
    );

    fireEvent.mouseEnter(
      screen.getByLabelText(
        "2026-08-05: Income, expenses, investments and debts",
      ),
    );

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Income");
    expect(tooltip).toHaveTextContent("Expense");
    expect(tooltip).toHaveTextContent("Invested");
    expect(tooltip).toHaveTextContent("Debt repayments");
    expect(tooltip).toHaveTextContent("$ 5.00");
  });
});
