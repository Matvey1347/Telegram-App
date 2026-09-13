import type { ReactNode } from "react";
import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardSummary, type DashboardSummary } from "@/lib/api";
import { DashboardOverview, DashboardPage } from "./dashboard-page";
import { currentCalendarMonthPeriod } from "./dashboard-period";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/api", () => ({
  getDashboardSummary: vi.fn(),
}));

const getSummaryMock = vi.mocked(getDashboardSummary);

beforeEach(() => {
  getSummaryMock.mockReset();
});

describe("dashboard", () => {
  it("uses the complete current calendar month", () => {
    expect(currentCalendarMonthPeriod(new Date(2026, 1, 12, 15))).toEqual({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });
  });

  it("loads the current calendar month by default instead of the last 30 days", async () => {
    getSummaryMock.mockReturnValue(new Promise<DashboardSummary>(() => {}));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <DashboardPage />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(getSummaryMock).toHaveBeenCalledWith(currentCalendarMonthPeriod()),
    );
    expect(
      screen.getByRole("button", { name: "Current month" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "30d" })).toBeNull();
  });

  it("shows the dashboard skeleton while a newly selected period loads", async () => {
    const currentMonth = {
      primaryCurrency: "UAH",
      incomeForPeriod: 600,
      expensesForPeriod: 100,
      investedCapitalForPeriod: 50,
      activeSubscribersEstimate: 300,
      revenuePerActiveSubscriber: 2,
    } as DashboardSummary;
    getSummaryMock
      .mockResolvedValueOnce(currentMonth)
      .mockReturnValueOnce(new Promise<DashboardSummary>(() => {}));
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, placeholderData: keepPreviousData },
      },
    });

    render(
      <QueryClientProvider client={client}>
        <DashboardPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("2.00 UAH")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All time" }));

    expect(
      await screen.findByRole("status", { name: "Loading dashboard" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("2.00 UAH")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(getSummaryMock).toHaveBeenLastCalledWith(undefined),
    );
  });

  it("shows one success metric and the three essential cash flows", () => {
    const data = {
      primaryCurrency: "USD",
      incomeForPeriod: 1_200,
      incomeBreakdownForPeriod: { channels: 1_000, other: 200 },
      excludedBalanceAdjustmentsForPeriod: 300,
      expensesForPeriod: 450,
      expensesBreakdownForPeriod: { channels: 350, other: 100 },
      investedCapitalForPeriod: 300,
      activeSubscribersEstimate: 600,
      revenuePerActiveSubscriber: 2,
      categoryBreakdown: [
        {
          name: "Advertising",
          type: "expense",
          flow: "expense",
          bucket: "channels",
          amount: 350,
          count: 2,
          excludedFromCashFlow: false,
          transactions: [
            {
              id: "expense-1",
              description: "Campaign payment",
              date: "2026-09-08T12:00:00.000Z",
              type: "expense",
              amount: 250,
              currency: "UAH",
              amountInPrimaryCurrency: 250,
              account: {
                id: "account-1",
                name: "Ukraine Card",
                currency: "UAH",
              },
            },
          ],
        },
        {
          name: "AI Tokens",
          type: "expense",
          flow: "expense",
          bucket: "other",
          amount: 100,
          count: 1,
          excludedFromCashFlow: false,
          transactions: [
            {
              id: "expense-2",
              description: "OpenAI subscription",
              date: "2026-09-07T12:00:00.000Z",
              type: "expense",
              amount: 100,
              currency: "USD",
              amountInPrimaryCurrency: 100,
              account: {
                id: "account-2",
                name: "Business Card",
                currency: "USD",
              },
            },
          ],
        },
        {
          name: "Balance Adjustment",
          type: "expense",
          flow: "adjustment",
          bucket: "other",
          amount: 300,
          count: 1,
          excludedFromCashFlow: true,
          transactions: [
            {
              id: "adjustment-1",
              description: "Balance correction",
              date: "2026-09-06T12:00:00.000Z",
              type: "expense",
              amount: 300,
              currency: "USD",
              amountInPrimaryCurrency: 300,
              account: {
                id: "account-2",
                name: "Business Card",
                currency: "USD",
              },
            },
          ],
        },
        {
          name: "Investment",
          type: "income",
          flow: "investment",
          bucket: "other",
          amount: 300,
          count: 1,
          excludedFromCashFlow: false,
          transactions: [
            {
              id: "investment-1",
              description: "Founder investment",
              date: "2026-09-05T12:00:00.000Z",
              type: "income",
              amount: 300,
              currency: "USD",
              amountInPrimaryCurrency: 300,
              account: {
                id: "account-2",
                name: "Business Card",
                currency: "USD",
              },
            },
          ],
        },
      ],
    } as DashboardSummary;

    render(<DashboardOverview data={data} />);

    expect(
      screen.getByText("Revenue per active subscriber"),
    ).toBeInTheDocument();
    expect(screen.getByText("2.00 USD")).toBeInTheDocument();
    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Investments")).toBeInTheDocument();
    expect(screen.getAllByText("Channels")).toHaveLength(2);
    expect(screen.getByText("Other (bots, etc.)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "1,000.00 USD channel revenue divided by 600 active subscribers.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Balance adjustments")).toBeInTheDocument();
    expect(screen.getByText("Excluded from cash flow")).toBeInTheDocument();
    expect(
      document.querySelector('[data-dashboard-breakdown-icon="Channels"]'),
    ).toHaveClass("bg-sky-500/15", "text-sky-300");
    fireEvent.click(screen.getByRole("button", { name: /Expenses/ }));
    expect(screen.getByText("Advertising")).toBeInTheDocument();
    expect(screen.getByText("AI Tokens")).toBeInTheDocument();
    expect(screen.getByText("Campaign payment")).toBeInTheDocument();
    expect(
      screen.getByText("Ukraine Card", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("-250.00 UAH")).toBeInTheDocument();
    expect(screen.getByText("Balance correction")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Investments/ }));
    expect(screen.getByText("Founder investment")).toBeInTheDocument();
  });

  it("explains why the key metric is unavailable without active subscribers", () => {
    const data = {
      primaryCurrency: "USD",
      incomeForPeriod: 1_200,
      expensesForPeriod: 0,
      investedCapitalForPeriod: 0,
      activeSubscribersEstimate: 0,
      revenuePerActiveSubscriber: null,
    } as DashboardSummary;

    render(<DashboardOverview data={data} />);

    expect(
      screen.getByText(
        "Active subscriber data is required to calculate this metric.",
      ),
    ).toBeInTheDocument();
  });
});
