import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type {
  ConsumerFinanceDashboard,
  ConsumerFinanceProfile,
} from "@telegram-system/shared";
import { ConsumerFinanceScreens } from "./consumer-finance-screens";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  accounts: vi.fn(),
  categories: vi.fn(),
  transactionMounts: 0,
  transferMounts: 0,
}));

vi.mock("@/lib/features/finance/consumer-finance-insights-api", () => ({
  consumerFinanceInsightsApi: { dashboard: mocks.dashboard },
}));
vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: {
    accounts: mocks.accounts,
    categories: mocks.categories,
  },
}));
vi.mock("./finance-dashboard", () => ({
  FinanceDashboard: () => <div>Dashboard screen</div>,
}));
vi.mock("./finance-budget", () => ({
  FinanceBudget: () => <div>Budget screen</div>,
}));
vi.mock("./finance-analytics", () => ({
  FinanceAnalytics: ({ onUpgrade }: { onUpgrade: () => void }) => (
    <button onClick={onUpgrade}>Upgrade from Analytics</button>
  ),
}));
vi.mock("./finance-accounts", () => ({
  FinanceAccountsScreen: () => <div>Accounts screen</div>,
}));
vi.mock("./finance-account-editor", () => ({
  FinanceAccountEditorScreen: ({ accountId }: { accountId: string }) => (
    <div>Account editor {accountId}</div>
  ),
}));
vi.mock("./finance-account-center", () => ({
  FinanceAccountCenter: () => <div>Profile account screen</div>,
}));
vi.mock("./finance-onboarding", () => ({
  FinanceOnboardingScreen: () => <div>Onboarding screen</div>,
}));
vi.mock("./finance-transactions", () => ({
  FinanceTransactions: ({
    initiallyOpenType,
  }: {
    initiallyOpenType: "EXPENSE" | "INCOME" | null;
  }) => {
    const [mount] = useState(() => ++mocks.transactionMounts);
    return (
      <div>
        Transaction {initiallyOpenType} mount {mount}
      </div>
    );
  },
}));
vi.mock("./finance-transfers", () => ({
  FinanceTransfers: ({
    initiallyOpen,
    onCreateAccount,
  }: {
    initiallyOpen: boolean;
    onCreateAccount: () => void;
  }) => {
    const [mount] = useState(() => ++mocks.transferMounts);
    return (
      <div>
        Transfer {String(initiallyOpen)} mount {mount}
        <button onClick={onCreateAccount}>Create account from transfer</button>
      </div>
    );
  },
}));
vi.mock("./finance-debts", () => ({
  FinanceDebts: () => <div>Debts screen</div>,
}));
vi.mock("./finance-regular-payments", () => ({
  FinanceRegularPayments: () => <div>Regular payments screen</div>,
}));
vi.mock("./finance-savings", () => ({
  FinanceSavings: () => <div>Savings screen</div>,
}));
vi.mock("./finance-investments", () => ({
  FinanceInvestments: () => <div>Investments screen</div>,
}));
vi.mock("./finance-investment-detail", () => ({
  FinanceInvestmentDetailScreen: ({
    investmentId,
  }: {
    investmentId: string;
  }) => <div>Investment {investmentId}</div>,
}));

const profile: ConsumerFinanceProfile = {
  id: "profile-1",
  defaultCurrency: "USD",
  timezone: "UTC",
  locale: "en",
  onboardingCompletedAt: "2026-08-21T00:00:00.000Z",
  telegramUser: {
    displayName: "Ada Lovelace",
    username: "ada_lovelace",
    avatarUrl: null,
  },
};
const dashboard: ConsumerFinanceDashboard = {
  profile,
  stats: {
    currency: "USD",
    income: "0",
    expense: "0",
    saved: "0",
    invested: "0",
    investmentReturns: "0",
    net: "0",
    netWorth: {
      amount: "0",
      currency: "USD",
      cashAmount: "0",
      investmentValue: "0",
      complete: true,
      excludedAccountCount: 0,
      excludedInvestmentCount: 0,
    },
    totalBalance: {
      amount: "0",
      currency: "USD",
      includedAccountCount: 0,
      excludedAccounts: [],
    },
    accounts: [],
    categories: [],
  },
  limits: [],
  savings: {
    currency: "USD",
    allocated: "0",
    backed: "0",
    activeGoals: 0,
    completedGoals: 0,
    underfundedGoals: 0,
    excludedGoals: [],
  },
  investments: {
    currency: "USD",
    totalInvested: "0",
    totalReturned: "0",
    currentValue: "0",
    profitLoss: "0",
    returnPercentage: null,
    activeInvestments: 0,
    closedInvestments: 0,
    excludedInvestments: [],
  },
  recent: [],
};

function renderScreens(
  activeProfile: ConsumerFinanceProfile,
  activeScreen:
    | "home"
    | "budget"
    | "accounts"
    | "account"
    | "analytics"
    | "transactions"
    | "transfers"
    | "debts"
    | "regular-payments"
    | "savings"
    | "investments"
    | "investment"
    | "profile",
  onScreenChange = vi.fn(),
  accountId: string | null = null,
  investmentId: string | null = null,
  onAccountEdit = vi.fn(),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConsumerFinanceScreens
        botId="bot-1"
        profile={activeProfile}
        screen={activeScreen}
        onScreenChange={onScreenChange}
        surface="browser"
        accountId={accountId}
        investmentId={investmentId}
        onAccountEdit={onAccountEdit}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.dashboard.mockReset().mockResolvedValue(dashboard);
  mocks.accounts.mockReset().mockResolvedValue([]);
  mocks.categories.mockReset().mockResolvedValue([]);
  mocks.transactionMounts = 0;
  mocks.transferMounts = 0;
});

describe("ConsumerFinanceScreens request budget", () => {
  it("opens Dashboard with one screen-specific GET and no reference fan-out", async () => {
    renderScreens(profile, "home");

    expect(await screen.findByText("Dashboard screen")).toBeInTheDocument();
    expect(mocks.dashboard).toHaveBeenCalledOnce();
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.categories).not.toHaveBeenCalled();
  });

  it("does not load Dashboard before onboarding is complete", async () => {
    renderScreens({ ...profile, onboardingCompletedAt: null }, "home");

    expect(await screen.findByText("Onboarding screen")).toBeInTheDocument();
    await waitFor(() => expect(mocks.dashboard).not.toHaveBeenCalled());
  });

  it("lets the lazy Budget screen own all of its reads", async () => {
    renderScreens(profile, "budget");

    expect(await screen.findByText("Budget screen")).toBeInTheDocument();
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(mocks.categories).not.toHaveBeenCalled();
    expect(mocks.accounts).not.toHaveBeenCalled();
  });

  it.each([
    ["debts", "Debts screen"],
    ["regular-payments", "Regular payments screen"],
    ["savings", "Savings screen"],
    ["investments", "Investments screen"],
    ["profile", "Profile account screen"],
  ] as const)("renders the lazy %s destination", async (destination, label) => {
    renderScreens(profile, destination);

    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(mocks.accounts).not.toHaveBeenCalled();
  });

  it("delegates a deep-linked id to the lazy investment detail", async () => {
    renderScreens(profile, "investment", vi.fn(), null, "investment-1");
    expect(
      await screen.findByText("Investment investment-1"),
    ).toBeInTheDocument();
  });

  it("lets the lazy Accounts screen own its collection read", async () => {
    renderScreens(profile, "accounts");

    expect(await screen.findByText("Accounts screen")).toBeInTheDocument();
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.categories).not.toHaveBeenCalled();
  });

  it("delegates a deep-linked id to the lazy account editor", async () => {
    renderScreens(profile, "account", vi.fn(), "account-1");

    expect(
      await screen.findByText("Account editor account-1"),
    ).toBeInTheDocument();
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(mocks.categories).not.toHaveBeenCalled();
  });

  it("routes the transfer prerequisite action directly to account creation", async () => {
    const onAccountEdit = vi.fn();
    renderScreens(profile, "transfers", vi.fn(), null, null, onAccountEdit);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Create account from transfer",
      }),
    );
    expect(onAccountEdit).toHaveBeenCalledWith("create");
  });

  it("routes browser upgrade actions to the dedicated Billing screen", async () => {
    const onScreenChange = vi.fn();
    renderScreens(profile, "analytics", onScreenChange);

    fireEvent.click(
      await screen.findByRole("button", { name: "Upgrade from Analytics" }),
    );

    expect(onScreenChange).toHaveBeenCalledWith("billing");
  });

  it("remounts transaction and transfer editors for each action request", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const renderActive = (
      activeScreen: "transactions" | "transfers",
      actionRequestId: number,
    ) => (
      <QueryClientProvider client={client}>
        <ConsumerFinanceScreens
          botId="bot-1"
          profile={profile}
          screen={activeScreen}
          onScreenChange={vi.fn()}
          surface="browser"
          openTransaction={activeScreen === "transactions" ? "EXPENSE" : null}
          openTransfer={activeScreen === "transfers"}
          actionRequestId={actionRequestId}
        />
      </QueryClientProvider>
    );
    const view = render(renderActive("transactions", 1));
    expect(
      await screen.findByText("Transaction EXPENSE mount 1"),
    ).toBeInTheDocument();

    view.rerender(renderActive("transactions", 2));
    expect(
      await screen.findByText("Transaction EXPENSE mount 2"),
    ).toBeInTheDocument();

    view.rerender(renderActive("transfers", 3));
    expect(
      await screen.findByText("Transfer true mount 1"),
    ).toBeInTheDocument();
    view.rerender(renderActive("transfers", 4));
    expect(
      await screen.findByText("Transfer true mount 2"),
    ).toBeInTheDocument();
  });
});
