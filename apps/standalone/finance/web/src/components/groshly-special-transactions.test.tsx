import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { GroshlyApp } from "@finance-web/groshly/main";
import { initial, today } from "@finance-web/groshly/data";

const App = GroshlyApp as ComponentType<{
  initialData: ReturnType<typeof initial>;
  onSaveLedgerEntry?: (input: { draft: { categoryId?: string | null } }) => Promise<ReturnType<typeof initial>>;
}>;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} });
});

function snapshot() {
  const data = initial();
  data.onboarded = true;
  data.lang = "en";
  return data;
}

describe("Groshly special transactions", () => {
  it("settles the AI preparation state after a simple message", async () => {
    render(<App initialData={snapshot()} />);
    fireEvent.click(screen.getByRole("button", { name: /AI/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message to AI" }), {
      target: { value: "expense 120 groceries" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("I prepared the actions. Review them before saving.")).toBeInTheDocument());
    expect(screen.queryByText("Preparing actions...")).not.toBeInTheDocument();
  });

  it("edits an investment cash flow without requiring or sending a category", async () => {
    const data = snapshot();
    data.transactions = [{
      id: "investment-cash-flow", type: "expense", purpose: "INVESTMENT_CONTRIBUTION",
      amount: 100, accountId: "a1", categoryId: null, title: "Index fund", date: today(), currency: "UAH",
    }] as unknown as typeof data.transactions;
    const onSaveLedgerEntry = vi.fn().mockResolvedValue(data);
    render(<App initialData={data} onSaveLedgerEntry={onSaveLedgerEntry} />);
    fireEvent.click(screen.getByRole("button", { name: /Activity/ }));
    fireEvent.click(screen.getByRole("button", { name: /Index fund/ }));
    expect(screen.getByText("Invested")).toBeInTheDocument();
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("button", { name: "Choose category" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSaveLedgerEntry).toHaveBeenCalledOnce());
    expect(onSaveLedgerEntry.mock.calls[0][0].draft.categoryId).toBeNull();
  });

  it("opens the source debt instead of the ledger editor for a debt entry", () => {
    const data = snapshot();
    data.transactions = [{
      id: "debt-origin", type: "income", purpose: "PASS_THROUGH", amount: 200,
      accountId: "a1", categoryId: null, title: "Loan from Alex", date: today(), currency: "UAH",
    }] as unknown as typeof data.transactions;
    data.debts = [{ ...data.debts[0], id: "source-debt", name: "Alex", originTransactionId: "debt-origin" }] as unknown as typeof data.debts;
    render(<App initialData={data} />);
    fireEvent.click(screen.getByRole("button", { name: /Activity/ }));
    fireEvent.click(screen.getByRole("button", { name: /Loan from Alex/ }));
    expect(screen.getByText("Borrowed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit debt" }));
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("shows localized category names and returns from chart drilldown", () => {
    const data = snapshot();
    render(<App initialData={data} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Insights/ })[0]);
    const groceries = screen.getByRole("button", { name: /Groceries:/ });
    expect(groceries).toHaveTextContent("Groceries");
    expect(groceries).toHaveTextContent("🛒");
    fireEvent.click(groceries);
    expect(screen.getByRole("button", { name: "Back to insights" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to insights" }));
    expect(screen.getByRole("heading", { name: "Insights" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Activity/ }));
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Filter by category" }));
    expect(screen.getByRole("button", { name: /🛒.*Groceries/ })).toBeInTheDocument();
  });
});
