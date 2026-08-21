import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/providers/toast-provider";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { FinanceTransactions } from "./finance-transactions";

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: {
    transactions: vi.fn(),
    transaction: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    undoTransaction: vi.fn(),
  },
}));

function renderTransactions() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToastProvider>
        <FinanceTransactions
          botId="bot-1"
          accounts={[]}
          categories={[]}
          locale="en"
          timezone="UTC"
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("FinanceTransactions receipt detail", () => {
  it("fetches receipt items only after the user opens the purchase detail", async () => {
    vi.mocked(consumerFinanceApi.transactions).mockResolvedValue({
      items: [
        {
          id: "receipt-1",
          accountId: "account-1",
          type: "EXPENSE",
          amount: "83.42",
          currency: "PLN",
          occurredAt: "2026-08-21T10:00:00.000Z",
          merchantDisplay: "Biedronka",
          source: "RECEIPT",
          itemCount: 2,
          account: { id: "account-1", name: "mBank", currency: "PLN" },
        },
      ],
      nextCursor: null,
    });
    vi.mocked(consumerFinanceApi.transaction).mockResolvedValue({
      id: "receipt-1",
      accountId: "account-1",
      type: "EXPENSE",
      amount: "83.42",
      currency: "PLN",
      occurredAt: "2026-08-21T10:00:00.000Z",
      merchantDisplay: "Biedronka",
      source: "RECEIPT",
      itemCount: 2,
      account: { id: "account-1", name: "mBank", currency: "PLN" },
      items: [
        {
          id: "item-1",
          displayName: "Milk",
          quantity: "2",
          unitPrice: "4.5",
          totalAmount: "9",
          currency: "PLN",
          category: { id: "category-1", name: "Groceries" },
        },
      ],
    });

    renderTransactions();

    expect(await screen.findByText("Biedronka")).toBeInTheDocument();
    expect(consumerFinanceApi.transaction).not.toHaveBeenCalled();
    expect(screen.getByText(/2 Items/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Purchase details" }));

    await waitFor(() =>
      expect(consumerFinanceApi.transaction).toHaveBeenCalledWith(
        "bot-1",
        "receipt-1",
      ),
    );
    expect(await screen.findByText("Milk")).toBeInTheDocument();
    expect(screen.getByText(/Quantity: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Unit price: zł 4.50/)).toBeInTheDocument();
  });
});
