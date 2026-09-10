import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceSavings } from "./finance-savings";
import { FinanceInvestments } from "./finance-investments";

const api = vi.hoisted(() => ({
  savings: vi.fn(),
  investments: vi.fn(),
  summary: vi.fn(),
  accounts: vi.fn(),
  allocate: vi.fn(),
}));
vi.mock("@/lib/features/finance/consumer-finance-savings-goals-api", () => ({
  consumerFinanceSavingsGoalsApi: {
    list: api.savings,
    allocate: api.allocate,
  },
}));
vi.mock("@/lib/features/finance/consumer-finance-investments-api", () => ({
  consumerFinanceInvestmentsApi: {
    list: api.investments,
    summary: api.summary,
  },
}));
vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: { accounts: api.accounts },
}));

function host(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {node}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.savings.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  api.accounts.mockReset().mockResolvedValue([]);
  api.investments
    .mockReset()
    .mockResolvedValue({ items: [], nextCursor: null });
  api.summary.mockReset().mockResolvedValue({
    currency: "USD",
    totalInvested: "0",
    totalReturned: "0",
    currentValue: "0",
    profitLoss: "0",
    returnPercentage: null,
    activeInvestments: 0,
    closedInvestments: 0,
    excludedInvestments: [],
  });
  api.allocate.mockReset();
});

describe("Consumer Finance savings and investments screens", () => {
  it("loads subsequent savings pages with the server status filter", async () => {
    api.savings.mockImplementation((_bot: string, query: { cursor?: string }) =>
      Promise.resolve({
        items: [],
        nextCursor: query.cursor ? null : "goal-next",
      }),
    );
    host(<FinanceSavings botId="bot" locale="en" defaultCurrency="USD" />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(api.savings).toHaveBeenLastCalledWith("bot", {
      status: "ACTIVE",
      cursor: "goal-next",
      limit: 30,
    });
  });

  it("loads up to 100 active reallocation destinations outside the active filter", async () => {
    host(<FinanceSavings botId="bot" locale="en" defaultCurrency="USD" />);
    fireEvent.click(await screen.findByRole("button", { name: "Active" }));
    fireEvent.click(screen.getByRole("option", { name: "Completed" }));
    await waitFor(() =>
      expect(api.savings).toHaveBeenCalledWith("bot", {
        status: "ACTIVE",
        cursor: undefined,
        limit: 100,
      }),
    );
  });

  it("renders the savings empty state and opens the account-independent goal editor", async () => {
    host(<FinanceSavings botId="bot" locale="en" defaultCurrency="USD" />);
    expect(await screen.findByText(/No savings goals yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));
    expect(
      screen.getByRole("dialog", { name: "Add goal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/without changing account balances/i),
    ).toBeInTheDocument();
  });

  it("reuses the allocation idempotency key when a failed submit is retried", async () => {
    const goal = {
      id: "goal-1",
      name: "Home",
      targetAmount: "100",
      currency: "USD",
      status: "ACTIVE" as const,
      currentAllocated: "25",
      linkedAllocated: "25",
      legacyUnlinkedAmount: "0",
      backedAmount: "25",
      remainingAmount: "75",
      progressPercentage: 25,
      fundingStatus: "BACKED" as const,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    };
    api.savings.mockResolvedValue({ items: [goal], nextCursor: null });
    api.accounts.mockResolvedValue([
      {
        id: "account-1",
        name: "Cash",
        type: "CASH",
        currency: "USD",
        openingBalance: "100",
        balance: "100",
      },
    ]);
    api.allocate
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({
        goals: [goal],
        movement: null,
        duplicate: true,
      });
    host(<FinanceSavings botId="bot" locale="en" defaultCurrency="USD" />);
    await screen.findByText("Home");
    fireEvent.click(screen.getByRole("button", { name: "Allocate" }));
    const dialog = screen.getByRole("dialog");
    const amount = dialog.querySelector('input[inputmode="decimal"]');
    expect(amount).not.toBeNull();
    fireEvent.change(amount!, { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Allocate" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Allocate" }));
    await waitFor(() => expect(api.allocate).toHaveBeenCalledTimes(2));

    expect(api.allocate.mock.calls[0][2].idempotencyKey).toBe(
      api.allocate.mock.calls[1][2].idempotencyKey,
    );
  });

  it("renders universal investment economics and opens one bounded detail route", async () => {
    const onOpen = vi.fn();
    api.investments.mockResolvedValue({
      items: [
        {
          id: "studio",
          name: "Photo studio",
          type: "BUSINESS",
          currency: "USD",
          status: "ACTIVE",
          startedAt: "2026-01-01",
          totalInvested: "0",
          totalReturned: "5",
          currentValue: "25",
          profitLoss: "30",
          returnPercentage: null,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        },
      ],
      nextCursor: null,
    });
    host(
      <FinanceInvestments
        botId="bot"
        locale="en"
        defaultCurrency="USD"
        onOpen={onOpen}
      />,
    );
    expect(await screen.findByText("Photo studio")).toBeInTheDocument();
    expect(screen.getByText("Positive result · —")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open details" }));
    expect(onOpen).toHaveBeenCalledWith("studio");
    expect(api.investments).toHaveBeenCalledOnce();
  });

  it("loads subsequent investment pages without dropping the status filter", async () => {
    api.investments.mockImplementation(
      (_bot: string, query: { cursor?: string }) =>
        Promise.resolve({
          items: [],
          nextCursor: query.cursor ? null : "asset-next",
        }),
    );
    host(
      <FinanceInvestments
        botId="bot"
        locale="en"
        defaultCurrency="USD"
        onOpen={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(api.investments).toHaveBeenLastCalledWith("bot", {
      status: "ACTIVE",
      cursor: "asset-next",
      limit: 30,
    });
  });
});
