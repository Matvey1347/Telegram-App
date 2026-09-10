import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceDebt } from "@telegram-system/shared";
import { FinanceDebts } from "./finance-debts";

const api = vi.hoisted(() => ({
  debts: vi.fn(),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  settleDebt: vi.fn(),
  accounts: vi.fn(),
}));
vi.mock("@/lib/features/finance/consumer-finance-obligations-api", () => ({
  consumerFinanceObligationsApi: api,
}));
vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: { accounts: api.accounts },
}));

const debt: ConsumerFinanceDebt = {
  id: "debt-1",
  direction: "I_OWE",
  status: "OPEN",
  name: "Alex",
  amount: "42",
  currency: "USD",
  accountId: "cash",
  account: {
    id: "cash",
    name: "Cash wallet",
    currency: "USD",
    iconPresentation: { type: "unicode", value: "💵" },
  },
  dueAt: "2026-09-01T00:00:00.000Z",
  scheduleTimezone: "UTC",
  note: "Dinner",
  isOverdue: true,
  version: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function renderDebts() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <FinanceDebts botId="bot" locale="en" timezone="UTC" />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.debts.mockResolvedValue({ items: [debt], nextCursor: null });
  api.accounts.mockResolvedValue([]);
});

describe("FinanceDebts", () => {
  it("renders embedded summaries and an explicit overdue state without row reads", async () => {
    renderDebts();

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    expect(screen.getByText(/Overdue/)).toHaveClass("text-rose-300");
    expect(screen.getByText(/Cash wallet/)).toBeInTheDocument();
    expect(api.accounts).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add debt" }));
    await waitFor(() => expect(api.accounts).toHaveBeenCalledOnce());
  });

  it("settles through confirmation and invalidates only narrow affected reads", async () => {
    api.debts
      .mockResolvedValueOnce({ items: [debt], nextCursor: null })
      .mockResolvedValue({ items: [], nextCursor: null });
    api.settleDebt.mockResolvedValue({
      debt: { ...debt, status: "SETTLED", isOverdue: false },
      duplicate: false,
      transaction: {
        id: "transaction",
        accountId: "cash",
        type: "EXPENSE",
        amount: "42",
        currency: "USD",
        occurredAt: "2026-09-08T00:00:00.000Z",
      },
    });
    const { client } = renderDebts();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(await screen.findByRole("button", { name: "Settle" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("Alex"), {
      target: { value: "Alex" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Settle" }));

    await waitFor(() =>
      expect(api.settleDebt).toHaveBeenCalledWith("bot", "debt-1"),
    );
    expect(await screen.findByText("No open debts.")).toBeInTheDocument();
    expect(invalidate.mock.calls.map(([input]) => input?.queryKey)).toEqual(
      expect.arrayContaining([
        ["consumer-finance", "bot", "debts"],
        ["consumer-finance", "bot", "accounts"],
        ["consumer-finance", "bot", "transactions"],
        ["consumer-finance", "bot", "dashboard"],
        ["consumer-finance", "bot", "analytics"],
      ]),
    );
    expect(invalidate).toHaveBeenCalledTimes(5);
  });

  it("offers a retry after a collection failure", async () => {
    api.debts.mockRejectedValue(new Error("offline"));
    renderDebts();

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.debts).toHaveBeenCalledTimes(2));
  });
});
