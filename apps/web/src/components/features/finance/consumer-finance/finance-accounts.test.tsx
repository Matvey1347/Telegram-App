import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceAccount } from "@telegram-system/shared";
import { FinanceAccounts } from "./finance-accounts";

const apiMocks = vi.hoisted(() => ({
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  archiveAccount: vi.fn(),
}));

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: apiMocks,
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

function renderAccounts(accounts: ConsumerFinanceAccount[] = []) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <FinanceAccounts
        botId="bot"
        accounts={accounts}
        defaultCurrency="USD"
        locale="en"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("FinanceAccounts CRUD", () => {
  it("lists and creates an account through the API", async () => {
    apiMocks.createAccount.mockResolvedValue(account);
    renderAccounts();

    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    fireEvent.change(screen.getAllByRole("textbox")[0], {
      target: { value: "Daily card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiMocks.createAccount).toHaveBeenCalledOnce());
    expect(apiMocks.createAccount).toHaveBeenCalledWith("bot", {
      name: "Daily card",
      emoji: "💳",
      type: "CARD",
      currency: "USD",
      openingBalance: "0",
    });
  });

  it("updates an existing account", async () => {
    apiMocks.updateAccount.mockResolvedValue({ ...account, name: "Primary" });
    renderAccounts([account]);

    expect(screen.getByText("Daily card")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit account: Daily card" }),
    );
    fireEvent.change(screen.getByDisplayValue("Daily card"), {
      target: { value: "Primary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiMocks.updateAccount).toHaveBeenCalledOnce());
    expect(apiMocks.updateAccount).toHaveBeenCalledWith("bot", "account-1", {
      name: "Primary",
      emoji: "💳",
      type: "CARD",
    });
  });

  it("archives only after typed confirmation", async () => {
    apiMocks.archiveAccount.mockResolvedValue({
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

    await waitFor(() => expect(apiMocks.archiveAccount).toHaveBeenCalledOnce());
    expect(apiMocks.archiveAccount).toHaveBeenCalledWith("bot", "account-1");
  });
});
