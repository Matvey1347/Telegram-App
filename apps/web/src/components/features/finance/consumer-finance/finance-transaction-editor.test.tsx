import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceTransaction,
} from "@telegram-system/shared";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { FinanceTransactionEditor } from "./finance-transaction-editor";
import { consumerFinanceObligationsApi } from "@/lib/features/finance/consumer-finance-obligations-api";

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: {
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
  },
}));
vi.mock("@/lib/features/finance/consumer-finance-obligations-api", () => ({
  consumerFinanceObligationsApi: { createSharedExpense: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe("FinanceTransactionEditor", () => {
  it("opens the transaction type requested by the global launcher", () => {
    const client = new QueryClient();
    render(
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
          initiallyOpenType="INCOME"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByDisplayValue("INCOME")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add expense" }),
    ).not.toBeInTheDocument();
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
      purpose: "ORDINARY",
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
      purpose: "ORDINARY",
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
          initiallyOpenType="EXPENSE"
          onClose={vi.fn()}
          onSaved={onSaved}
        />
      </QueryClientProvider>,
    );
    fireEvent.change(
      view.container.querySelector('input[inputmode="decimal"]')!,
      { target: { value: "12.34" } },
    );
    expect(
      screen.getByRole("button", { name: "Save transaction" }),
    ).toBeEnabled();
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

  it("persists cash movement separately from the user's economic share", async () => {
    const created: ConsumerFinanceTransaction = {
      id: "shared-bill",
      accountId: "a",
      type: "EXPENSE",
      purpose: "ORDINARY",
      amount: "100",
      economicAmount: "25",
      necessity: "DISCRETIONARY",
      currency: "PLN",
      occurredAt: "2026-09-11T12:00:00.000Z",
    };
    vi.mocked(consumerFinanceApi.createTransaction).mockResolvedValue(created);
    const view = render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceTransactionEditor
          botId="bot"
          accounts={[
            {
              id: "a",
              name: "Card",
              iconPresentation: { type: "unicode", value: "💳" },
              type: "CARD",
              currency: "PLN",
              openingBalance: "0",
              balance: "0",
              defaultCurrency: "PLN",
            },
          ]}
          categories={[]}
          editing={null}
          locale="en"
          timezone="UTC"
          initiallyOpenType="EXPENSE"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const moneyInputs = view.container.querySelectorAll(
      'input[inputmode="decimal"]',
    );
    fireEvent.change(moneyInputs[0]!, { target: { value: "100" } });
    fireEvent.change(moneyInputs[1]!, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Not specified" }));
    fireEvent.click(screen.getByRole("option", { name: "Optional" }));
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));

    await waitFor(() =>
      expect(consumerFinanceApi.createTransaction).toHaveBeenCalledWith(
        "bot",
        expect.objectContaining({
          amount: "100",
          economicAmount: "25",
          necessity: "DISCRETIONARY",
        }),
      ),
    );
  });

  it("creates a shared expense and one debt per participant", async () => {
    const client = new QueryClient();
    client.setQueryData(
      ["consumer-finance", "bot", "debts", { status: "OPEN" }],
      { pages: [], pageParams: [] },
    );
    const transaction: ConsumerFinanceTransaction = {
      id: "shared",
      accountId: "a",
      type: "EXPENSE",
      purpose: "ORDINARY",
      amount: "100",
      economicAmount: "25",
      currency: "PLN",
      occurredAt: "2026-09-12T12:00:00.000Z",
    };
    vi.mocked(
      consumerFinanceObligationsApi.createSharedExpense,
    ).mockResolvedValue({
      transaction,
      debts: [],
    });
    const view = render(
      <QueryClientProvider client={client}>
        <FinanceTransactionEditor
          botId="bot"
          accounts={[
            {
              id: "a",
              name: "Card",
              iconPresentation: { type: "unicode", value: "💳" },
              type: "CARD",
              currency: "PLN",
              openingBalance: "0",
              balance: "0",
              defaultCurrency: "PLN",
            },
          ]}
          categories={[]}
          editing={null}
          locale="en"
          timezone="UTC"
          initiallyOpenType="EXPENSE"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "My expense" }));
    fireEvent.click(
      screen.getByRole("option", { name: "Shared expense with repayments" }),
    );
    const moneyInputs = view.container.querySelectorAll(
      'input[inputmode="decimal"]',
    );
    fireEvent.change(moneyInputs[0]!, { target: { value: "100" } });
    fireEvent.change(
      view.container.querySelector('input[placeholder="100"]')!,
      {
        target: { value: "25" },
      },
    );
    fireEvent.change(screen.getByLabelText("Person"), {
      target: { value: "Ana" },
    });
    fireEvent.change(screen.getByLabelText("Owes"), {
      target: { value: "75" },
    });
    expect(screen.getByText(/^Allocated:/)).toHaveTextContent(
      "100.00 / 100.00 PLN",
    );
    expect(
      screen.getByRole("button", { name: "Save transaction" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));

    await waitFor(() =>
      expect(
        consumerFinanceObligationsApi.createSharedExpense,
      ).toHaveBeenCalledWith(
        "bot",
        expect.objectContaining({
          amount: "100",
          ownShare: "25",
          participants: [
            expect.objectContaining({ name: "Ana", amount: "75" }),
          ],
        }),
      ),
    );
    expect(
      client.getQueryState([
        "consumer-finance",
        "bot",
        "debts",
        { status: "OPEN" },
      ])?.isInvalidated,
    ).toBe(true);
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
          initiallyOpenType="EXPENSE"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>,
    );
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
