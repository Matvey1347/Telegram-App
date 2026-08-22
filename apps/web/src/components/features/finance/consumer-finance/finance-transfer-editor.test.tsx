import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceTransfer,
} from "@telegram-system/shared";
import { FinanceTransferEditor } from "./finance-transfer-editor";

const apiMocks = vi.hoisted(() => ({
  createTransfer: vi.fn(),
  updateTransfer: vi.fn(),
}));

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: apiMocks,
}));

const account = (
  id: string,
  name: string,
  archivedAt?: string,
): ConsumerFinanceAccount => ({
  id,
  name,
  iconPresentation: { type: "unicode", value: "💳" },
  type: "CARD",
  currency: "USD",
  openingBalance: "0",
  balance: "10",
  defaultCurrency: "USD",
  archivedAt,
});
const accounts = [account("a", "Cash"), account("b", "Card")];
const renderEditor = (
  props: Partial<React.ComponentProps<typeof FinanceTransferEditor>> = {},
) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FinanceTransferEditor
        botId="bot"
        accounts={accounts}
        locale="en"
        timezone="Pacific/Kiritimati"
        editing={null}
        initiallyOpen={false}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );

describe("FinanceTransferEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads edit values when the parent switches the keyed editor from create to edit", () => {
    const client = new QueryClient();
    const editing: ConsumerFinanceTransfer = {
      id: "t",
      fromAccountId: "a",
      toAccountId: "b",
      fromAmount: "7",
      toAmount: "7",
      fromCurrency: "USD",
      toCurrency: "USD",
      exchangeRate: "1",
      occurredAt: "2026-01-01T22:00:00.000Z",
      description: "Move",
      fromAccount: { id: "a", name: "Cash", currency: "USD" },
      toAccount: { id: "b", name: "Card", currency: "USD" },
    };
    const props = {
      botId: "bot",
      accounts,
      locale: "en" as const,
      timezone: "Pacific/Kiritimati",
      initiallyOpen: false,
      onClose: vi.fn(),
      onSaved: vi.fn(),
    };
    const view = render(
      <QueryClientProvider client={client}>
        <FinanceTransferEditor
          key="create-transfer"
          {...props}
          editing={null}
        />
      </QueryClientProvider>,
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <FinanceTransferEditor key={editing.id} {...props} editing={editing} />
      </QueryClientProvider>,
    );
    expect(screen.getByDisplayValue("7")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Move")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "02.01.2026" }),
    ).toBeInTheDocument();
  });

  it("excludes the source from destination choices and never asks for conversion inputs", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /add transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: "Select account" }));
    expect(screen.getAllByRole("button", { name: /Cash · USD/ })).toHaveLength(
      1,
    );
    expect(screen.queryByText(/received amount/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^rate$/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save transfer/i }),
    ).toBeDisabled();
  });

  it("preserves only the archived account selected for each endpoint", () => {
    const archivedAt = "2026-01-01T00:00:00.000Z";
    const rows = [
      account("a", "Archived source", archivedAt),
      account("b", "Active target"),
      account("c", "Other archived", archivedAt),
      account("d", "Other active"),
    ];
    const editing: ConsumerFinanceTransfer = {
      id: "t",
      fromAccountId: "a",
      toAccountId: "b",
      fromAmount: "1",
      toAmount: "1",
      fromCurrency: "USD",
      toCurrency: "USD",
      exchangeRate: "1",
      occurredAt: "2026-01-01T22:00:00.000Z",
      fromAccount: { id: "a", name: "Archived source", currency: "USD" },
      toAccount: { id: "b", name: "Active target", currency: "USD" },
    };
    renderEditor({ accounts: rows, editing });
    fireEvent.click(screen.getByRole("button", { name: /Archived source/ }));
    expect(
      screen.getAllByRole("button", { name: /Archived source/ }),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /Other archived/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Active target/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /Other active/ }),
    ).toBeInTheDocument();
  });

  it("still rejects invalid same-account historical data client-side", () => {
    const editing: ConsumerFinanceTransfer = {
      id: "bad",
      fromAccountId: "a",
      toAccountId: "a",
      fromAmount: "1",
      toAmount: "1",
      fromCurrency: "USD",
      toCurrency: "USD",
      exchangeRate: "1",
      occurredAt: "2026-01-01T22:00:00.000Z",
      fromAccount: { id: "a", name: "Cash", currency: "USD" },
      toAccount: { id: "a", name: "Cash", currency: "USD" },
    };
    renderEditor({ editing });
    expect(
      screen.getByText("Choose two different accounts."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save transfer/i }),
    ).toBeDisabled();
  });

  it("creates a transfer through the authoritative API response", async () => {
    const saved: ConsumerFinanceTransfer = {
      id: "saved",
      fromAccountId: "a",
      toAccountId: "b",
      fromAmount: "4",
      toAmount: "4",
      fromCurrency: "USD",
      toCurrency: "USD",
      exchangeRate: "1",
      occurredAt: "2026-08-21T12:00:00.000Z",
      fromAccount: { id: "a", name: "Cash", currency: "USD" },
      toAccount: { id: "b", name: "Card", currency: "USD" },
    };
    apiMocks.createTransfer.mockResolvedValue(saved);
    const onSaved = vi.fn();
    renderEditor({ initiallyOpen: true, onSaved });

    fireEvent.click(screen.getByRole("button", { name: "Select account" }));
    fireEvent.click(screen.getByRole("button", { name: /Card · USD/ }));
    const amount = screen.getAllByRole("textbox")[0];
    fireEvent.change(amount, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save transfer" }));

    await waitFor(() => expect(apiMocks.createTransfer).toHaveBeenCalledOnce());
    expect(apiMocks.createTransfer).toHaveBeenCalledWith(
      "bot",
      expect.objectContaining({
        fromAccountId: "a",
        toAccountId: "b",
        amount: "4",
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(saved);
  });
});
