import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceDashboard,
} from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { FinanceTransfers } from "./finance-transfers";

const api = vi.hoisted(() => ({
  accounts: vi.fn(),
  transfers: vi.fn(),
}));

vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: { accounts: api.accounts },
}));
vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: {
    transfers: api.transfers,
    createTransfer: vi.fn(),
    updateTransfer: vi.fn(),
    deleteTransfer: vi.fn(),
  },
}));

const account = (
  id: string,
  archivedAt: string | null = null,
): ConsumerFinanceAccount => ({
  id,
  name: `Account ${id}`,
  iconPresentation: { type: "unicode", value: "💳" },
  type: "CARD",
  currency: "USD",
  openingBalance: "0",
  balance: "100",
  defaultCurrency: "USD",
  archivedAt,
});

function renderTransfers(
  onCreateAccount = vi.fn(),
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  render(
    <QueryClientProvider client={client}>
      <FinanceTransfers
        botId="bot"
        locale="en"
        timezone="UTC"
        onCreateAccount={onCreateAccount}
      />
    </QueryClientProvider>,
  );
  return onCreateAccount;
}

describe("FinanceTransfers account prerequisite", () => {
  beforeEach(() => {
    api.accounts.mockReset();
    api.transfers.mockReset();
    api.transfers.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("offers the first account as the only action when no active account exists", async () => {
    api.accounts.mockResolvedValue([]);
    renderTransfers();

    expect(
      await screen.findByRole("button", { name: "Create first account" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(api.transfers).not.toHaveBeenCalled();
  });

  it("shows only the second-account action and skips history with one active account", async () => {
    api.accounts.mockResolvedValue([account("one")]);
    const onCreateAccount = renderTransfers();

    expect(
      await screen.findByText(
        "A transfer cannot be made while you have only one active account.",
      ),
    ).toBeInTheDocument();
    const create = screen.getByRole("button", {
      name: "Create second account",
    });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen.queryByPlaceholderText("Search description"),
    ).not.toBeInTheDocument();
    expect(api.transfers).not.toHaveBeenCalled();

    fireEvent.click(create);
    expect(onCreateAccount).toHaveBeenCalledOnce();
  });

  it("shows the second-account state immediately from the dashboard cache", () => {
    api.accounts.mockReturnValue(new Promise(() => undefined));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    client.setQueryData(consumerFinanceKeys.dashboard("bot"), {
      stats: { accounts: [account("one")] },
    } as ConsumerFinanceDashboard);

    renderTransfers(vi.fn(), client);

    expect(
      screen.getByRole("button", { name: "Create second account" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(api.accounts).not.toHaveBeenCalled();
    expect(api.transfers).not.toHaveBeenCalled();
  });

  it("does not count an archived account toward the transfer prerequisite", async () => {
    api.accounts.mockResolvedValue([
      account("active"),
      account("archived", "2026-09-08T00:00:00.000Z"),
    ]);
    renderTransfers();

    expect(
      await screen.findByRole("button", { name: "Create second account" }),
    ).toBeInTheDocument();
    expect(api.transfers).not.toHaveBeenCalled();
  });

  it("loads transfer tools and history when two active accounts exist", async () => {
    api.accounts.mockResolvedValue([account("one"), account("two")]);
    renderTransfers();

    await waitFor(() => expect(api.transfers).toHaveBeenCalledOnce());
    expect(
      await screen.findByPlaceholderText("Search description"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-scene='transfers']"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create second account" }),
    ).not.toBeInTheDocument();
  });
});
