import type { ReactNode } from "react";
import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDashboardSummary, type DashboardSummary } from "@/lib/api";
import { dashboardKeys } from "@/lib/query-keys";
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

  it("reuses a ten-minute current-month summary without another request", async () => {
    const currentMonth = {
      primaryCurrency: "UAH",
      incomeForPeriod: 600,
      expensesForPeriod: 100,
      investedCapitalForPeriod: 50,
      activeSubscribersEstimate: 300,
      revenuePerActiveSubscriber: 2,
    } as DashboardSummary;
    const period = currentCalendarMonthPeriod();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      dashboardKeys.summary("month", period.dateFrom, period.dateTo),
      currentMonth,
      { updatedAt: Date.now() - 10 * 60_000 },
    );

    render(
      <QueryClientProvider client={client}>
        <DashboardPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("2.00 ₴")).toBeInTheDocument();
    expect(getSummaryMock).not.toHaveBeenCalled();
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

    expect(await screen.findByText("2.00 ₴")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All time" }));

    expect(
      await screen.findByRole("status", { name: "Loading dashboard" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("2.00 ₴")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(getSummaryMock).toHaveBeenLastCalledWith(undefined),
    );
  });

  it("shows period spending, sales and acquired audience without treating missing counters as zero", () => {
    render(<DashboardOverview data={{
      primaryCurrency: "UAH",
      expensesBreakdownForPeriod: { channels: 75, other: 25 },
      reinvestedEarningsForPeriod: 200,
      accountBalances: [
        { id: "current", name: "Current", currency: "UAH", balance: 2300 },
        { id: "overdraft", name: "Overdraft", currency: "UAH", balance: -100 },
      ],
      spendingMix: { advertising: 50, channelPurchases: 25, otherChannelExpenses: 0 },
      categoryBreakdown: [{
        id: "channel-purchase",
        name: "Buy Channels",
        flow: "expense",
        bucket: "channels",
        amount: 25,
        iconPresentation: { type: "unicode", value: "📣" },
      }],
      investmentBreakdownForPeriod: [
        { origin: "EXTERNAL", amount: 200, movements: [
          { movementType: "CONTRIBUTION", amountInPrimaryCurrency: 300 },
          { movementType: "WITHDRAWAL", amountInPrimaryCurrency: -100 },
        ] },
        { origin: "REINVESTMENT", amount: 100, movements: [
          { movementType: "CONTRIBUTION", amountInPrimaryCurrency: 100 },
        ] },
      ],
      salesMix: { total: 4, owner: 3, otherSellers: 1, unassigned: 0, external: 2 },
      trafficSources: [
        { kind: "BOT", trackedLinks: 2, measuredLinks: 1, arrivals: 1000, requests: 1000, joined: 1, departures: 0, departurePercent: 0 },
        { kind: "AD_CAMPAIGNS", trackedLinks: 1, measuredLinks: 1, arrivals: 3000, requests: 3000, joined: 3000, departures: 95, departurePercent: 2.5, spend: 100, costPerRequest: 50 },
        { kind: "BROADCAST", trackedLinks: 1, measuredLinks: 0, arrivals: null },
      ],
    } as DashboardSummary} />);

    expect(screen.getByRole("heading", { name: "Investment and spending" })).toBeInTheDocument();
    const reinvestments = within(screen.getByText("Reinvestments").closest("div[tabindex]")!);
    expect(reinvestments.getByText("40%")).toBeInTheDocument();
    expect(reinvestments.getByText("200.00 ₴")).toBeInTheDocument();
    const accountsHeading = screen.getByRole("heading", { name: "Balance across all accounts" });
    expect(within(accountsHeading.parentElement!).getByText("2,200.00 ₴")).toBeInTheDocument();
    expect(within(screen.getByText("Workspace owner").closest("div[tabindex]")!).getByText("75%")).toBeInTheDocument();
    expect(within(screen.getByText("Deals including external channels").closest("div[tabindex]")!).getByText("50%")).toBeInTheDocument();
    const botConversion = within(screen.getByRole("region", { name: "Bot conversion" }));
    expect(botConversion.getByText("33.3%")).toBeInTheDocument();
    expect(botConversion.getByText("1,000 bot requests / 3,000 measured inbound requests")).toBeInTheDocument();
    expect(botConversion.getByText("10,000")).toBeInTheDocument();
    fireEvent.change(botConversion.getByRole("spinbutton", { name: "Planned inbound requests" }), { target: { value: "6000" } });
    expect(botConversion.getByText("2,000")).toBeInTheDocument();
    fireEvent.change(botConversion.getByRole("spinbutton", { name: "Planned inbound requests" }), { target: { value: "" } });
    expect(botConversion.getByText("—")).toBeInTheDocument();
    const unsubscribeRates = within(screen.getByRole("region", { name: "Unsubscribe rate by source" }));
    expect(unsubscribeRates.getByText("3.2%")).toBeInTheDocument();
    expect(screen.getByText("Deals in the selected period · 4")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Channel expense categories" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Capital contributions" }).querySelector("svg [data-segment]")).not.toBeNull();
    expect(screen.getByRole("row", { name: /Welcome bot/ }).querySelector("svg")).not.toBeNull();
    expect(within(screen.getByRole("row", { name: /Ad campaigns/ })).getByText("95")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Broadcast links/ })).getAllByText("—").length).toBeGreaterThan(0);
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
    expect(screen.getByText("2.00 $")).toBeInTheDocument();
    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Investments")).toBeInTheDocument();
    expect(screen.getAllByText("Channels")).toHaveLength(2);
    expect(screen.getByText("Other (bots, etc.)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "1,000.00 $ channel revenue divided by 600 active subscribers.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Balance adjustments")).toBeInTheDocument();
    expect(screen.getByText("Excluded from cash flow")).toBeInTheDocument();
    expect(
      document.querySelector('[data-dashboard-breakdown-icon="Channels"]'),
    ).toHaveClass("bg-sky-500/15", "text-sky-300");
    expect(
      screen.queryByRole("button", { name: /Expenses/ }),
    ).not.toBeInTheDocument();
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
