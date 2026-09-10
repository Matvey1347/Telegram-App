import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceAccount } from "@telegram-system/shared";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  FinanceAccountEditor,
  FinanceAccountEditorScreen,
} from "./finance-account-editor";

const api = vi.hoisted(() => ({
  accounts: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
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

function renderEditor(props: {
  account?: ConsumerFinanceAccount;
  creating: boolean;
}, seedAccounts = true) {
  const client = new QueryClient();
  if (seedAccounts) {
    client.setQueryData(consumerFinanceKeys.accounts("bot"), [account]);
  }
  const onBack = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <FinanceAccountEditor
        botId="bot"
        defaultCurrency="USD"
        locale="en"
        account={props.account}
        creating={props.creating}
        onBack={onBack}
      />
    </QueryClientProvider>,
  );
  return { client, onBack };
}

function renderEditorScreen(accountId: string) {
  const onBack = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FinanceAccountEditorScreen
        botId="bot"
        defaultCurrency="USD"
        locale="en"
        accountId={accountId}
        onBack={onBack}
      />
    </QueryClientProvider>,
  );
  return { onBack };
}

beforeEach(() => vi.clearAllMocks());

describe("FinanceAccountEditor", () => {
  it("resolves an existing deep link from the accounts collection only", async () => {
    api.accounts.mockResolvedValue([account]);

    renderEditorScreen("account-1");

    expect(await screen.findByDisplayValue("Daily card")).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledOnce();
  });

  it("keeps a missing deep-linked account recoverable", async () => {
    api.accounts.mockResolvedValue([]);
    const { onBack } = renderEditorScreen("missing");

    fireEvent.click(await screen.findByRole("button", { name: "Accounts" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("does not fetch the accounts collection for create mode", async () => {
    renderEditorScreen("create");

    expect(await screen.findByText("Add account")).toBeInTheDocument();
    expect(api.accounts).not.toHaveBeenCalled();
  });

  it("creates with the existing backend contract and patches the list cache", async () => {
    api.createAccount.mockResolvedValue(account);
    const { client, onBack } = renderEditor({ creating: true });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.change(screen.getAllByRole("textbox")[0], {
      target: { value: "Daily card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createAccount).toHaveBeenCalledOnce());
    expect(api.createAccount).toHaveBeenCalledWith("bot", {
      name: "Daily card",
      emoji: "💳",
      type: "CARD",
      currency: "USD",
      openingBalance: "0",
    });
    expect(
      client.getQueryData<ConsumerFinanceAccount[]>(
        consumerFinanceKeys.accounts("bot"),
      ),
    ).toEqual([account]);
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: consumerFinanceKeys.transactionLists("bot"),
    });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: consumerFinanceKeys.transferLists("bot"),
    });
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("does not turn a direct-create cache miss into a partial account list", async () => {
    api.createAccount.mockResolvedValue(account);
    const { client } = renderEditor({ creating: true }, false);

    fireEvent.change(screen.getAllByRole("textbox")[0], {
      target: { value: "Daily card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.createAccount).toHaveBeenCalledOnce());
    expect(
      client.getQueryData(consumerFinanceKeys.accounts("bot")),
    ).toBeUndefined();
  });

  it("preserves a hydrated image icon when only name/type are updated", async () => {
    const imageAccount: ConsumerFinanceAccount = {
      ...account,
      iconPresentation: {
        type: "image",
        id: "icon-1",
        url: "https://example.test/icon.png",
      },
    };
    api.updateAccount.mockResolvedValue({ ...imageAccount, name: "Primary" });
    renderEditor({ account: imageAccount, creating: false });

    expect(screen.getByDisplayValue("USD")).toHaveAttribute("readonly");

    fireEvent.change(screen.getByDisplayValue("Daily card"), {
      target: { value: "Primary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.updateAccount).toHaveBeenCalledOnce());
    expect(api.updateAccount).toHaveBeenCalledWith("bot", "account-1", {
      name: "Primary",
      type: "CARD",
    });
  });

  it("returns without mutating when Back is used", () => {
    const { onBack } = renderEditor({ account, creating: false });

    fireEvent.click(screen.getByRole("button", { name: "Accounts" }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(api.updateAccount).not.toHaveBeenCalled();
  });
});
