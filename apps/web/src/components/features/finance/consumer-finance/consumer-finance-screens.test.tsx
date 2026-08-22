import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConsumerFinanceDashboard,
  ConsumerFinanceProfile,
} from "@telegram-system/shared";
import { ConsumerFinanceScreens } from "./consumer-finance-screens";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  accounts: vi.fn(),
  categories: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: mocks,
}));
vi.mock("./finance-dashboard", () => ({
  FinanceDashboard: () => <div>Dashboard screen</div>,
}));
vi.mock("./finance-budget", () => ({
  FinanceBudget: () => <div>Budget screen</div>,
}));
vi.mock("./finance-ultimate", () => ({
  FinanceUltimate: ({ onUpgrade }: { onUpgrade: () => void }) => (
    <button onClick={onUpgrade}>Upgrade from Ultimate</button>
  ),
}));
vi.mock("./finance-accounts", () => ({
  FinanceAccounts: () => <div>Accounts screen</div>,
}));
vi.mock("./finance-onboarding", () => ({
  FinanceOnboarding: () => <div>Onboarding screen</div>,
}));

const profile: ConsumerFinanceProfile = {
  id: "profile-1",
  defaultCurrency: "USD",
  timezone: "UTC",
  locale: "en",
  onboardingCompletedAt: "2026-08-21T00:00:00.000Z",
};
const dashboard: ConsumerFinanceDashboard = {
  profile,
  stats: {
    currency: "USD",
    income: "0",
    expense: "0",
    net: "0",
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
  recent: [],
};

function renderScreens(
  activeProfile: ConsumerFinanceProfile,
  activeScreen: "home" | "budget" | "accounts" | "ultimate",
  onScreenChange = vi.fn(),
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
        onAction={vi.fn()}
        surface="browser"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.dashboard.mockReset().mockResolvedValue(dashboard);
  mocks.accounts.mockReset().mockResolvedValue([]);
  mocks.categories.mockReset().mockResolvedValue([]);
  mocks.updateSettings.mockReset();
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

    expect(screen.getByText("Onboarding screen")).toBeInTheDocument();
    await waitFor(() => expect(mocks.dashboard).not.toHaveBeenCalled());
  });

  it("loads categories but not unused accounts for Budget", async () => {
    renderScreens(profile, "budget");

    expect(await screen.findByText("Budget screen")).toBeInTheDocument();
    expect(mocks.dashboard).toHaveBeenCalledOnce();
    expect(mocks.categories).toHaveBeenCalledOnce();
    expect(mocks.accounts).not.toHaveBeenCalled();
  });

  it("shows a retryable error instead of a false empty Accounts state", async () => {
    mocks.accounts.mockRejectedValue(new Error("offline"));

    renderScreens(profile, "accounts");

    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(
      screen.getByText("Accounts or categories could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Accounts screen")).not.toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.accounts).toHaveBeenCalledTimes(2));
    expect(mocks.categories).not.toHaveBeenCalled();
  });

  it("routes browser upgrade actions to the dedicated Billing screen", () => {
    const onScreenChange = vi.fn();
    renderScreens(profile, "ultimate", onScreenChange);

    fireEvent.click(
      screen.getByRole("button", { name: "Upgrade from Ultimate" }),
    );

    expect(onScreenChange).toHaveBeenCalledWith("billing");
  });
});
