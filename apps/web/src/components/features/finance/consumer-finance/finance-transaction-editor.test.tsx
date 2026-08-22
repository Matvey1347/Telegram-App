import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceTransaction,
} from "@telegram-system/shared";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { FinanceTransactionEditor } from "./finance-transaction-editor";

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: {
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe("FinanceTransactionEditor", () => {
  it("opens first-class expense and income flows with the correct type", () => {
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <FinanceTransactionEditor
          botId="bot"
          accounts={[
            {
              id: "a",
              name: "Cash",
              iconPresentation: { type: "unicode", value: "💵" },
              type: "CASH",
              currency: "USD",
              openingBalance: "0",
              balance: "0",
              defaultCurrency: "USD",
            },
          ]}
          categories={[]}
          editing={null}
          locale="en"
          timezone="UTC"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add income" }));
    expect(screen.getByDisplayValue("INCOME")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(screen.getByDisplayValue("EXPENSE")).toBeInTheDocument();
    view.unmount();
  });

  it("loads edit values when the parent switches the keyed editor from create to edit", () => {
    const client = new QueryClient();
    const accounts: ConsumerFinanceAccount[] = [
      {
        id: "a",
        name: "Cash",
        iconPresentation: { type: "unicode", value: "💵" },
        type: "CASH",
        currency: "USD",
        openingBalance: "0",
        balance: "0",
        defaultCurrency: "USD",
      },
    ];
    const editing: ConsumerFinanceTransaction = {
      id: "tx",
      accountId: "a",
      type: "EXPENSE",
      amount: "9",
      currency: "USD",
      occurredAt: "2026-01-01T22:00:00.000Z",
      description: "Coffee",
    };
    const props = {
      botId: "bot",
      accounts,
      categories: [],
      locale: "en" as const,
      timezone: "Pacific/Kiritimati",
      onClose: vi.fn(),
      onSaved: vi.fn(),
    };
    const view = render(
      <QueryClientProvider client={client}>
        <FinanceTransactionEditor
          key="create-transaction"
          {...props}
          editing={null}
        />
      </QueryClientProvider>,
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <FinanceTransactionEditor
          key={editing.id}
          {...props}
          editing={editing}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByDisplayValue("9")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Coffee")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "02.01.2026" }),
    ).toBeInTheDocument();
  });

  it("persists a created expense and reports the authoritative response", async () => {
    const client = new QueryClient();
    const onSaved = vi.fn();
    const created: ConsumerFinanceTransaction = {
      id: "created",
      accountId: "a",
      type: "EXPENSE",
      amount: "12.34",
      currency: "USD",
      occurredAt: "2026-08-21T12:00:00.000Z",
    };
    vi.mocked(consumerFinanceApi.createTransaction).mockResolvedValue(created);
    const view = render(
      <QueryClientProvider client={client}>
        <FinanceTransactionEditor
          botId="bot"
          accounts={[
            {
              id: "a",
              name: "Cash",
              iconPresentation: { type: "unicode", value: "💵" },
              type: "CASH",
              currency: "USD",
              openingBalance: "0",
              balance: "0",
              defaultCurrency: "USD",
            },
          ]}
          categories={[]}
          editing={null}
          locale="en"
          timezone="UTC"
          onClose={vi.fn()}
          onSaved={onSaved}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    fireEvent.change(
      view.container.querySelector('input[inputmode="decimal"]')!,
      { target: { value: "12.34" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));

    await waitFor(() =>
      expect(consumerFinanceApi.createTransaction).toHaveBeenCalledWith(
        "bot",
        expect.objectContaining({
          accountId: "a",
          type: "EXPENSE",
          amount: "12.34",
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalledWith(created);
  });

  it("keeps the editor open and shows an API mutation failure", async () => {
    vi.mocked(consumerFinanceApi.createTransaction).mockRejectedValue(
      new Error("offline"),
    );
    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceTransactionEditor
          botId="bot"
          accounts={[
            {
              id: "a",
              name: "Cash",
              iconPresentation: { type: "unicode", value: "💵" },
              type: "CASH",
              currency: "USD",
              openingBalance: "0",
              balance: "0",
              defaultCurrency: "USD",
            },
          ]}
          categories={[]}
          editing={null}
          locale="en"
          timezone="UTC"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    fireEvent.change(
      view.container.querySelector('input[inputmode="decimal"]')!,
      { target: { value: "7" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));

    expect(
      await screen.findByText(
        "Could not save. Check the fields and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
