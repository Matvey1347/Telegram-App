import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceAccount } from "@telegram-system/shared";
import { FinanceAccounts, FinanceAccountsScreen } from "./finance-accounts";

const api = vi.hoisted(() => ({
  accounts: vi.fn(),
  archiveAccount: vi.fn(),
}));
vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: api,
}));

const account: ConsumerFinanceAccount = {
  id: "account-1",
  name: "Daily card",
  iconPresentation: { type: "unicode", value: "💳" },
  type: "CARD",
  currency: "USD",
  openingBalance: "10",
  balance: "10",
  defaultCurrency: "USD",
};

function renderAccounts(
  accounts: ConsumerFinanceAccount[] = [],
  onEdit = vi.fn(),
) {
  return {
    onEdit,
    ...render(
      <QueryClientProvider client={new QueryClient()}>
        <FinanceAccounts
          botId="bot"
          accounts={accounts}
          locale="en"
          onEdit={onEdit}
        />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("FinanceAccounts list", () => {
  it("keeps a collection failure retryable in the lazy screen", async () => {
    api.accounts.mockRejectedValue(new Error("offline"));
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FinanceAccountsScreen botId="bot" locale="en" onEdit={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.accounts).toHaveBeenCalledTimes(2));
  });

  it("routes create and account-row actions to the full-page editor", () => {
    const { onEdit } = renderAccounts([account]);

    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(onEdit).toHaveBeenCalledWith("create");

    fireEvent.click(screen.getAllByRole("button", { name: /Daily card/u })[0]);
    expect(onEdit).toHaveBeenCalledWith("account-1");
  });

  it("archives only after typed confirmation", async () => {
    api.archiveAccount.mockResolvedValue({
      ...account,
      archivedAt: "2026-08-21T00:00:00.000Z",
    });
    renderAccounts([account]);

    fireEvent.click(
      screen.getByRole("button", { name: "Archive account: Daily card" }),
    );
    fireEvent.change(screen.getByPlaceholderText("Daily card"), {
      target: { value: "Daily card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(api.archiveAccount).toHaveBeenCalledOnce());
    expect(api.archiveAccount).toHaveBeenCalledWith("bot", "account-1");
  });
});
