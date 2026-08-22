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

function renderTransactions(
  surface: "browser" | "telegram" = "telegram",
  locale: "en" | "uk" | "ru" = "en",
) {
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
          locale={locale}
          timezone="UTC"
          surface={surface}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("FinanceTransactions receipt detail", () => {
  it("keeps Mini App creation in the floating launcher and opens filters on demand", async () => {
    vi.mocked(consumerFinanceApi.transactions).mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    renderTransactions();

    await screen.findByText("No matching transactions.");
    expect(
      screen.queryByRole("button", { name: "Add expense" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search description or category"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(
      screen.getByPlaceholderText("Search description or category"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("localizes shared filter controls and keeps the calendar inside the modal", async () => {
    vi.mocked(consumerFinanceApi.transactions).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    renderTransactions("telegram", "ru");

    fireEvent.click(await screen.findByRole("button", { name: "Фильтры" }));
    const period = screen.getByRole("button", { name: "Выберите период" });
    fireEvent.click(period);

    expect(screen.getByText("Выберите начальную дату")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Очистить" })).toBeInTheDocument();
    expect(period.nextElementSibling).toHaveClass("right-0");
  });

  it("keeps long mobile transaction labels and amounts on one line", async () => {
    vi.mocked(consumerFinanceApi.transactions).mockResolvedValue({
      items: [
        {
          id: "long-row",
          accountId: "account-1",
          type: "EXPENSE",
          amount: "123456789012345.67",
          currency: "UAH",
          occurredAt: "2026-08-21T10:00:00.000Z",
          description:
            "A very long description that must not push the amount onto another line",
          account: {
            id: "account-1",
            name: "A very long account name that should be truncated safely",
            currency: "UAH",
            iconPresentation: { type: "unicode", value: "💳" },
          },
        },
      ],
      nextCursor: null,
    });

    renderTransactions();

    const amount = await screen.findByTitle(/123/);
    expect(amount).toHaveClass("whitespace-nowrap");
    expect(screen.getByTitle(/A very long description/)).toHaveClass(
      "truncate",
    );
  });

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
          account: {
            id: "account-1",
            name: "mBank",
            currency: "PLN",
            iconPresentation: { type: "unicode", value: "💳" },
          },
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
      account: {
        id: "account-1",
        name: "mBank",
        currency: "PLN",
        iconPresentation: { type: "unicode", value: "💳" },
      },
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

  it("uses a dense table on the browser surface without per-row detail GETs", async () => {
    vi.mocked(consumerFinanceApi.transactions).mockResolvedValue({
      items: [
        {
          id: "row-1",
          accountId: "account-1",
          type: "INCOME",
          amount: "1200",
          currency: "USD",
          occurredAt: "2026-08-21T10:00:00.000Z",
          description: "Client payment",
          account: {
            id: "account-1",
            name: "Bank",
            currency: "USD",
            iconPresentation: { type: "unicode", value: "🏦" },
          },
          category: {
            id: "category-1",
            name: "Salary",
            type: "INCOME",
            iconPresentation: { type: "unicode", value: "💼" },
          },
        },
      ],
      nextCursor: null,
    });

    renderTransactions("browser");

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Client payment")).toBeInTheDocument();
    expect(screen.getByText(/Bank/)).toBeInTheDocument();
    expect(consumerFinanceApi.transaction).not.toHaveBeenCalled();
  });
});
