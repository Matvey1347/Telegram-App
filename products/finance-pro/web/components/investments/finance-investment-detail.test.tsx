import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceInvestmentDetailScreen } from "./finance-investment-detail";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  cashFlows: vi.fn(),
  valuations: vi.fn(),
  addValuation: vi.fn(),
  archive: vi.fn(),
  accounts: vi.fn(),
}));
vi.mock("@/lib/features/finance/consumer-finance-investments-api", () => ({
  consumerFinanceInvestmentsApi: {
    get: api.get,
    cashFlows: api.cashFlows,
    valuations: api.valuations,
    addValuation: api.addValuation,
    archive: api.archive,
  },
}));
vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: { accounts: api.accounts },
}));

const investment = {
  id: "asset",
  name: "Studio",
  type: "BUSINESS" as const,
  currency: "USD",
  status: "ACTIVE" as const,
  startedAt: "2026-01-01T12:00:00.000Z",
  totalInvested: "10",
  totalReturned: "0",
  currentValue: "12",
  profitLoss: "2",
  returnPercentage: 20,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  cashFlows: { items: [], nextCursor: "embedded-is-not-terminal" },
  valuations: { items: [], nextCursor: "embedded-is-not-terminal" },
};
const flow = {
  id: "flow-2",
  investmentId: "asset",
  kind: "RETURN" as const,
  accountId: "cash",
  transactionId: "tx",
  amount: "2",
  currency: "USD",
  amountInInvestmentCurrency: "2",
  investmentCurrency: "USD",
  occurredAt: "2026-02-01",
  createdAt: "2026-02-01",
};
const valuation = {
  id: "value-2",
  investmentId: "asset",
  value: "12",
  currency: "USD",
  valuedAt: "2026-02-01",
  createdAt: "2026-02-01",
};

beforeEach(() => {
  api.get.mockReset().mockResolvedValue(investment);
  api.accounts.mockReset().mockResolvedValue([]);
  api.cashFlows
    .mockReset()
    .mockImplementation(
      (_bot: string, _id: string, query: { cursor?: string }) =>
        Promise.resolve(
          query.cursor
            ? { items: [flow], nextCursor: null }
            : { items: [], nextCursor: "flow-next" },
        ),
    );
  api.valuations
    .mockReset()
    .mockImplementation(
      (_bot: string, _id: string, query: { cursor?: string }) =>
        Promise.resolve(
          query.cursor
            ? { items: [valuation], nextCursor: null }
            : { items: [], nextCursor: "value-next" },
        ),
    );
  api.addValuation.mockReset();
  api.archive.mockReset();
});

describe("FinanceInvestmentDetailScreen histories", () => {
  it("loads bounded history pages, exposes loaded valuations to correction, and hides archive while active", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FinanceInvestmentDetailScreen
          botId="bot"
          investmentId="asset"
          locale="en"
          defaultCurrency="USD"
          onBack={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Studio")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    const loadMore = await screen.findAllByRole("button", {
      name: "Load more",
    });
    fireEvent.click(loadMore[0]);
    fireEvent.click(loadMore[1]);
    await waitFor(() =>
      expect(api.cashFlows).toHaveBeenLastCalledWith("bot", "asset", {
        cursor: "embedded-is-not-terminal",
        limit: 30,
      }),
    );
    await waitFor(() =>
      expect(api.valuations).toHaveBeenLastCalledWith("bot", "asset", {
        cursor: "embedded-is-not-terminal",
        limit: 30,
      }),
    );
    expect((await screen.findAllByText("$ 2.00")).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: "Valuation" }));
    fireEvent.click(
      screen.getByRole("button", { name: "New valuation (not a correction)" }),
    );
    expect(
      screen.getByRole("option", { name: /2026-02-01.*12/ }),
    ).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledOnce();
    expect(api.cashFlows).toHaveBeenCalledOnce();
    expect(api.valuations).toHaveBeenCalledOnce();
  });

  it("keeps archived investments read-only while preserving their history", async () => {
    api.get.mockResolvedValue({ ...investment, status: "ARCHIVED" });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FinanceInvestmentDetailScreen
          botId="bot"
          investmentId="asset"
          locale="en"
          defaultCurrency="USD"
          onBack={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Studio")).toBeInTheDocument();
    expect(
      screen.getByText("Archived investments are read-only."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByText("Cash flows")).toBeInTheDocument();
  });

  it("reuses the valuation idempotency key when a failed submit is retried", async () => {
    api.addValuation
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({
        investment,
        valuation,
        duplicate: false,
      });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FinanceInvestmentDetailScreen
          botId="bot"
          investmentId="asset"
          locale="en"
          defaultCurrency="USD"
          onBack={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByText("Studio");
    fireEvent.click(screen.getByRole("button", { name: "Valuation" }));
    const dialog = screen.getByRole("dialog");
    const amount = dialog.querySelector('input[inputmode="decimal"]');
    expect(amount).not.toBeNull();
    fireEvent.change(amount!, { target: { value: "12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Valuation" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Valuation" }));
    await waitFor(() => expect(api.addValuation).toHaveBeenCalledTimes(2));

    expect(api.addValuation.mock.calls[0][2].idempotencyKey).toBe(
      api.addValuation.mock.calls[1][2].idempotencyKey,
    );
  });

  it("omits a superseded valuation from the effective trend", async () => {
    api.get.mockResolvedValue({
      ...investment,
      valuations: {
        items: [
          {
            ...valuation,
            id: "old-value",
            value: "10",
            correctedByValuationId: "value-2",
          },
          { ...valuation, correctsValuationId: "old-value" },
        ],
        nextCursor: null,
      },
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FinanceInvestmentDetailScreen
          botId="bot"
          investmentId="asset"
          locale="en"
          defaultCurrency="USD"
          onBack={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const chart = await screen.findByRole("img", { name: /Valuation trend/ });
    expect(chart.getAttribute("aria-label")).toContain("12.00 USD");
    expect(chart.getAttribute("aria-label")).not.toContain("10.00 USD");
  });

  it("invalidates portfolio totals when a closed investment is archived", async () => {
    api.get.mockResolvedValue({ ...investment, status: "CLOSED" });
    api.archive.mockResolvedValue({ ...investment, status: "ARCHIVED" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(consumerFinanceKeys.investmentSummary("bot"), {});
    client.setQueryData(consumerFinanceKeys.dashboard("bot"), {});
    client.setQueryData(consumerFinanceKeys.analytics("bot", {}), {});
    render(
      <QueryClientProvider client={client}>
        <FinanceInvestmentDetailScreen
          botId="bot"
          investmentId="asset"
          locale="en"
          defaultCurrency="USD"
          onBack={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByText("Studio");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(api.archive).toHaveBeenCalledOnce());

    expect(
      client.getQueryState(consumerFinanceKeys.investmentSummary("bot"))
        ?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(consumerFinanceKeys.dashboard("bot"))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(consumerFinanceKeys.analytics("bot", {}))
        ?.isInvalidated,
    ).toBe(true);
  });
});
