import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import { GroshlyApp } from "@finance-web/groshly/main";
import { initial, today } from "@finance-web/groshly/data";

const App = GroshlyApp as ComponentType<{
  initialData: ReturnType<typeof initial>;
  onSaveLedgerEntry?: (input: { draft: { categoryId?: string | null } }) => Promise<ReturnType<typeof initial>>;
  onChangeRegularPayment?: (input: { id: string; action: string }) => Promise<ReturnType<typeof initial>>;
  onSaveInvestmentMovement?: (input: { id: string; mode: string; amount: number; accountId: string; occurredAt: string; idempotencyKey: string }) => Promise<ReturnType<typeof initial>>;
  onOpenInvestment?: (id: string) => Promise<unknown>;
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
  it("keeps an investment address and restores its details after a reload", async () => {
    const data = snapshot();
    data.investments = [{ id: "asset", name: "Fund", currency: "UAH", accountId: "a1", invested: 100, returned: 0, value: 100, events: [] }] as never;
    const detail = vi.fn().mockResolvedValue({ events: [{ id: "event", date: "2026-11-12", type: "deposit", amount: 25, accountId: "a1" }] });
    const view = render(<App initialData={data} onOpenInvestment={detail} />);
    fireEvent.click(screen.getByRole("link", { name: /Investments/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fund/ }));
    await waitFor(() => expect(window.location.search).toContain("investment=asset"));
    view.unmount();
    render(<App initialData={data} onOpenInvestment={detail} />);
    await waitFor(() => expect(screen.getByText("Investment details")).toBeInTheDocument());
    await waitFor(() => expect(detail).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Movement history")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(window.location.search).not.toContain("investment=");
  });
  it("waits for a contribution to be saved and uses the server snapshot", async () => {
    const data = snapshot();
    data.investments = [{ id: "asset", name: "Fund", currency: "UAH", accountId: "a1", invested: 100, returned: 0, value: 100, events: [] }] as never;
    const saved: typeof data = { ...data, investments: [{ id: "asset", name: "Fund", currency: "UAH", accountId: "a1", invested: 125, returned: 0, value: 100, events: [] }] as never };
    let resolve!: (value: typeof data) => void;
    const save = vi.fn(() => new Promise<typeof data>((done) => { resolve = done; }));
    render(<App initialData={data} onSaveInvestmentMovement={save} />);
    fireEvent.click(screen.getByRole("link", { name: /Investments/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fund/ }));
    fireEvent.click(screen.getByRole("button", { name: "Contribute" }));
    fireEvent.change(screen.getByRole("textbox", { name: "AMOUNT" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    expect(screen.queryByText("Investment updated")).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "asset", mode: "deposit", amount: 25, accountId: "a1", idempotencyKey: expect.any(String) }));
    resolve(saved);
    await waitFor(() => expect(screen.getByText("Investment updated")).toBeInTheDocument());
    expect(screen.getAllByText(/125/).length).toBeGreaterThan(0);
  });

  it("keeps the contribution form open on failure and reuses the request key on retry", async () => {
    const data = snapshot();
    data.investments = [{ id: "asset", name: "Fund", currency: "UAH", accountId: "a1", invested: 100, returned: 0, value: 100, events: [] }] as never;
    const save = vi.fn().mockRejectedValue(new Error("unavailable"));
    render(<App initialData={data} onSaveInvestmentMovement={save} />);
    fireEvent.click(screen.getByRole("link", { name: /Investments/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fund/ }));
    fireEvent.click(screen.getByRole("button", { name: "Contribute" }));
    fireEvent.change(screen.getByRole("textbox", { name: "AMOUNT" }), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Could not save the operation. Please try again.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]);
  });
  it("removes a cancelled recurring payment from the visible list", async () => {
    const data = snapshot();
    data.recurring = [{ ...data.recurring[0], id: "cancel-me", title: "Sample plan" }];
    const next = { ...data, recurring: [] };
    const change = vi.fn().mockResolvedValue(next);
    render(<App initialData={data} onChangeRegularPayment={change} />);
    fireEvent.click(screen.getByRole("link", { name: /Recurring payments/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sample plan/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Sample plan/ })).not.toBeInTheDocument());
    expect(change).toHaveBeenCalledWith({ id: "cancel-me", action: "cancel" });
  });

  it("keeps the payment visible when cancellation fails", async () => {
    const data = snapshot();
    data.recurring = [{ ...data.recurring[0], id: "keep-me", title: "Active plan" }];
    const change = vi.fn().mockRejectedValue(new Error("unavailable"));
    render(<App initialData={data} onChangeRegularPayment={change} />);
    fireEvent.click(screen.getByRole("link", { name: /Recurring payments/ }));
    fireEvent.click(screen.getByRole("button", { name: /Active plan/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByText("Could not cancel payment")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Active plan/ })).toBeInTheDocument();
  });

  it("filters debts by direction when switching tabs", () => {
    const data = snapshot();
    data.debts = [
      { ...data.debts[0], id: "owed", name: "Alex", direction: "owed" },
      { ...data.debts[0], id: "owe", name: "Sam", direction: "owe" },
    ];
    render(<App initialData={data} />);
    fireEvent.click(screen.getByRole("link", { name: /Debts/ }));
    expect(screen.getByRole("button", { name: /Debt details: Alex/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Debt details: Sam/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I owe" }));
    expect(screen.getByRole("button", { name: /Debt details: Sam/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Debt details: Alex/ })).not.toBeInTheDocument();
  });

  it("allows correcting a cross currency transfer after its source was emptied", async () => {
    const data = snapshot();
    data.accounts = [
      { id: "source", name: "Source", emoji: "💵", balance: 0, currency: "USD" },
      { id: "target", name: "Target", emoji: "💳", balance: 249.1, currency: "PLN" },
    ];
    data.rates = { UAH: 1, USD: 39.065435568, PLN: 10, EUR: 48.2 };
    data.transactions = [{ id: "transfer", type: "transfer", title: "Exchange", amount: 249.1, currency: "USD", receivedAmount: 249.1, receivedCurrency: "PLN", fromId: "source", toId: "target", date: today() }] as unknown as typeof data.transactions;
    const onSaveLedgerEntry = vi.fn().mockResolvedValue(data);
    render(<App initialData={data} onSaveLedgerEntry={onSaveLedgerEntry} />);
    fireEvent.click(screen.getByRole("button", { name: /Activity/ }));
    fireEvent.click(screen.getByRole("button", { name: /Exchange/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: /Transfer money/ }));
    await waitFor(() => expect(onSaveLedgerEntry).toHaveBeenCalledOnce());
    expect(onSaveLedgerEntry.mock.calls[0][0].draft.receivedAmount).toBe(973.12);
  });

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
