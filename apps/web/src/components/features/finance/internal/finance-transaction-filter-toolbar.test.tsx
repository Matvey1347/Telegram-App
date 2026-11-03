import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceTransactionFilterToolbar } from "./finance-transaction-filter-toolbar";

describe("FinanceTransactionFilterToolbar", () => {
  it("signals when the account catalog is needed by the account filter", () => {
    const onAccountFocus = vi.fn();
    render(
      <FinanceTransactionFilterToolbar
        accounts={[]}
        categories={[]}
        search=""
        accountId=""
        categoryId=""
        onSearchChange={vi.fn()}
        onAccountChange={vi.fn()}
        onAccountFocus={onAccountFocus}
        onCategoryChange={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Filter transactions by account" }),
    );

    expect(onAccountFocus).toHaveBeenCalledTimes(1);
  });
});
