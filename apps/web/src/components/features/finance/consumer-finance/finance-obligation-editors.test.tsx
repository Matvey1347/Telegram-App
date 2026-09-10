import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceDebt,
  ConsumerFinanceRegularPayment,
} from "@telegram-system/shared";
import { FinanceDebtEditor } from "./finance-debt-editor";
import { FinanceRegularPaymentEditor } from "./finance-regular-payment-editor";

const api = vi.hoisted(() => ({
  accounts: vi.fn(),
  categories: vi.fn(),
  createDebt: vi.fn(),
  updateDebt: vi.fn(),
  createRegularPayment: vi.fn(),
  updateRegularPayment: vi.fn(),
}));

vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: {
    accounts: api.accounts,
    categories: api.categories,
  },
}));
vi.mock("@/lib/features/finance/consumer-finance-obligations-api", () => ({
  consumerFinanceObligationsApi: api,
}));

const account: ConsumerFinanceAccount = {
  id: "cash",
  name: "Cash wallet",
  type: "CASH",
  currency: "USD",
  openingBalance: "0",
  balance: "200",
  defaultCurrency: "USD",
  iconPresentation: { type: "unicode", value: "💵" },
};
const category: ConsumerFinanceCategory = {
  id: "home",
  name: "Home",
  type: "EXPENSE",
  iconPresentation: { type: "unicode", value: "🏠" },
};
const debt: ConsumerFinanceDebt = {
  id: "debt",
  direction: "I_OWE",
  status: "OPEN",
  name: "Alex",
  amount: "42",
  currency: "USD",
  accountId: "cash",
  account,
  dueAt: "2026-09-12T00:00:00.000Z",
  scheduleTimezone: "UTC",
  note: "Dinner",
  isOverdue: false,
  version: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};
const payment: ConsumerFinanceRegularPayment = {
  id: "rent",
  name: "Rent",
  amount: "100",
  currency: "USD",
  accountId: "cash",
  account,
  categoryId: "home",
  category,
  recurrence: "MONTHLY",
  nextOccurrenceAt: "2026-10-01T00:00:00.000Z",
  scheduleTimezone: "UTC",
  note: "Flat",
  status: "ACTIVE",
  isDue: false,
  version: 3,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function wrapper(children: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.accounts.mockResolvedValue([account]);
  api.categories.mockResolvedValue([category]);
});

describe("consumer finance obligation editors", () => {
  it("creates a debt with the exact calendar-date contract", async () => {
    api.createDebt.mockResolvedValue(debt);
    const onSaved = vi.fn();
    wrapper(
      <FinanceDebtEditor
        botId="bot"
        editing={null}
        locale="en"
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    const inputs = dialog.querySelectorAll("input:not([type='hidden'])");
    fireEvent.change(inputs[0]!, { target: { value: "Alex" } });
    fireEvent.change(inputs[1]!, { target: { value: "42" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Select date" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Today" }));
    fireEvent.change(dialog.querySelector("textarea")!, {
      target: { value: "Dinner" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createDebt).toHaveBeenCalledOnce());
    expect(api.createDebt).toHaveBeenCalledWith("bot", {
      direction: "I_OWE",
      name: "Alex",
      amount: "42",
      accountId: "cash",
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      note: "Dinner",
    });
    expect(onSaved).toHaveBeenCalledWith(debt);
  });

  it("updates a debt without changing its existing relation defaults", async () => {
    api.updateDebt.mockResolvedValue({ ...debt, name: "Alex R." });
    wrapper(
      <FinanceDebtEditor
        botId="bot"
        editing={debt}
        locale="en"
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(
      dialog.querySelectorAll("input:not([type='hidden'])")[0]!,
      {
        target: { value: "Alex R." },
      },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateDebt).toHaveBeenCalledWith("bot", "debt", {
        direction: "I_OWE",
        name: "Alex R.",
        amount: "42",
        accountId: "cash",
        dueDate: "2026-09-12",
        note: "Dinner",
      }),
    );
  });

  it("starts regular-payment references together and creates the exact input", async () => {
    let resolveAccounts!: (value: ConsumerFinanceAccount[]) => void;
    let resolveCategories!: (value: ConsumerFinanceCategory[]) => void;
    api.accounts.mockReturnValue(
      new Promise((resolve) => {
        resolveAccounts = resolve;
      }),
    );
    api.categories.mockReturnValue(
      new Promise((resolve) => {
        resolveCategories = resolve;
      }),
    );
    api.createRegularPayment.mockResolvedValue(payment);
    const onSaved = vi.fn();
    wrapper(
      <FinanceRegularPaymentEditor
        botId="bot"
        editing={null}
        locale="en"
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    await waitFor(() => {
      expect(api.accounts).toHaveBeenCalledOnce();
      expect(api.categories).toHaveBeenCalledOnce();
    });
    resolveAccounts([account]);
    resolveCategories([category]);

    const dialog = await screen.findByRole("dialog");
    const inputs = dialog.querySelectorAll("input:not([type='hidden'])");
    fireEvent.change(inputs[0]!, { target: { value: "Rent" } });
    fireEvent.change(inputs[1]!, { target: { value: "100" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Select date" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Today" }));
    fireEvent.change(dialog.querySelector("textarea")!, {
      target: { value: "Flat" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createRegularPayment).toHaveBeenCalledOnce(),
    );
    expect(api.createRegularPayment).toHaveBeenCalledWith("bot", {
      name: "Rent",
      amount: "100",
      accountId: "cash",
      categoryId: null,
      recurrence: "MONTHLY",
      nextPaymentDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      note: "Flat",
    });
    expect(onSaved).toHaveBeenCalledWith(payment);
  });

  it("updates a regular payment with its stored category and schedule", async () => {
    api.updateRegularPayment.mockResolvedValue({
      ...payment,
      name: "New rent",
    });
    wrapper(
      <FinanceRegularPaymentEditor
        botId="bot"
        editing={payment}
        locale="en"
        timezone="UTC"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(
      dialog.querySelectorAll("input:not([type='hidden'])")[0]!,
      {
        target: { value: "New rent" },
      },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateRegularPayment).toHaveBeenCalledWith("bot", "rent", {
        name: "New rent",
        amount: "100",
        accountId: "cash",
        categoryId: "home",
        recurrence: "MONTHLY",
        nextPaymentDate: "2026-10-01",
        note: "Flat",
      }),
    );
  });
});
