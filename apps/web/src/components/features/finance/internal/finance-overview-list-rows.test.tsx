import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import type { Account, Transaction, Transfer } from "@/lib/api";
import {
  FinanceTransactionRow,
  FinanceTransferRow,
} from "./finance-overview-list-rows";

const fromAccount = {
  id: "from-account",
  name: "Poland Card",
  currency: "PLN",
  initialBalance: 0,
  isActive: true,
} as Account;

const toAccount = {
  id: "to-account",
  name: "Ukraine Card",
  currency: "UAH",
  initialBalance: 0,
  isActive: true,
} as Account;

describe("internal finance overview list rows", () => {
  it("pins transaction actions to the top-right on mobile", () => {
    const transaction = {
      id: "transaction-1",
      accountId: fromAccount.id,
      account: fromAccount,
      type: "expense",
      amount: 250,
      currency: "PLN",
      exchangeRateToPrimary: 1,
      amountInPrimaryCurrency: 250,
      category: "Advertising",
      description: "Campaign payment",
      date: "2026-09-10T10:00:00.000Z",
    } as Transaction;

    render(
      <FinanceTransactionRow
        transaction={transaction}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const row = screen
      .getByText("Campaign payment")
      .closest("[data-finance-row]");
    const actions = row?.querySelector('[data-finance-row-actions="true"]');
    expect(row).toHaveClass("relative", "pr-12", "sm:pr-4");
    expect(actions).toHaveClass("absolute", "right-3", "top-3", "sm:static");
  });

  it("pins transfer actions and renders a responsive stretched SVG connector", () => {
    const transfer = {
      id: "transfer-1",
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      fromAmount: 2500,
      toAmount: 27205,
      fromCurrency: "PLN",
      toCurrency: "UAH",
      date: "2026-09-10T10:00:00.000Z",
      fromAccount,
      toAccount,
    } as Transfer;

    render(
      <FinanceTransferRow
        transfer={transfer}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const row = screen.getByText("Poland Card").closest("[data-finance-row]");
    const actions = row?.querySelector('[data-finance-row-actions="true"]');
    const arrow = screen.getByRole("img", { name: "Transfer direction" });
    expect(row).toHaveClass(
      "relative",
      "pr-12",
      "md:pr-4",
      "md:grid-cols-[minmax(0,1fr)_minmax(4rem,0.45fr)_minmax(0,1fr)]",
    );
    expect(actions).toHaveClass("absolute", "right-3", "top-3");
    expect(actions).not.toHaveClass("md:static");
    expect(arrow).toHaveClass(
      "justify-start",
      "pl-3",
      "md:justify-center",
      "md:pl-0",
    );
    expect(arrow.querySelectorAll("svg")).toHaveLength(4);
    expect(arrow.querySelector(".md\\:flex svg")).toHaveClass("flex-1");
  });
});
