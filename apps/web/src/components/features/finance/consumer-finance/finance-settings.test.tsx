import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { FinanceSettings } from "./finance-settings";

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: {
    billing: vi.fn(),
    entitlements: vi.fn(),
    checkout: vi.fn(),
    updateSettings: vi.fn(),
    exportData: vi.fn(),
    reminders: vi.fn(),
    createReminder: vi.fn(),
    deleteData: vi.fn(),
    logout: vi.fn(),
  },
}));
const profile: ConsumerFinanceProfile = {
  id: "p",
  defaultCurrency: "USD",
  timezone: "UTC",
  locale: "en",
};
const renderSettings = (
  section: React.ComponentProps<typeof FinanceSettings>["section"] = "all",
  locale: "en" | "uk" | "ru" = "en",
) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FinanceSettings
        botId="bot"
        profile={{ ...profile, locale }}
        locale={locale}
        onCategories={vi.fn()}
        section={section}
      />
    </QueryClientProvider>,
  );

afterEach(() => vi.clearAllMocks());

beforeEach(() => {
  vi.mocked(consumerFinanceApi.reminders).mockResolvedValue([]);
  vi.mocked(consumerFinanceApi.billing).mockResolvedValue({
    plans: [],
    subscriptions: [],
    providers: [],
  });
  vi.mocked(consumerFinanceApi.entitlements).mockResolvedValue({
    tier: "FREE",
    capabilities: ["AI_INPUT", "RECEIPT_SCAN"],
    usage: [],
    activeUntil: null,
    cancelAtPeriodEnd: false,
  });
});

describe("FinanceSettings billing state", () => {
  it("uses a timezone selector instead of a free-form input", () => {
    renderSettings("profile");

    const timezone = screen.getByRole("button", { name: "UTC" });
    fireEvent.click(timezone);
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
  });

  it("localizes the shared timezone search for Russian", () => {
    renderSettings("profile", "ru");

    fireEvent.click(screen.getByRole("button", { name: "UTC" }));
    expect(screen.getByPlaceholderText("Поиск…")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("lazy-loads only the data owned by the selected browser section", async () => {
    const view = renderSettings("profile");
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(consumerFinanceApi.entitlements).not.toHaveBeenCalled();
    expect(consumerFinanceApi.billing).not.toHaveBeenCalled();
    expect(consumerFinanceApi.reminders).not.toHaveBeenCalled();

    view.unmount();
    renderSettings("reminders");
    await screen.findByText("No reminders yet.");
    expect(consumerFinanceApi.reminders).toHaveBeenCalledOnce();
    expect(consumerFinanceApi.entitlements).not.toHaveBeenCalled();
    expect(consumerFinanceApi.billing).not.toHaveBeenCalled();
  });

  it("does not show a tier before entitlements are authoritative", () => {
    vi.mocked(consumerFinanceApi.entitlements).mockReturnValue(
      new Promise(() => undefined),
    );
    renderSettings();
    expect(screen.getByText("Loading plan…")).toBeInTheDocument();
    expect(screen.queryByText("Finance Free")).not.toBeInTheDocument();
  });

  it("shows retry on entitlement failure", async () => {
    vi.mocked(consumerFinanceApi.entitlements).mockRejectedValue(
      new Error("offline"),
    );
    renderSettings();
    expect(
      await screen.findByText("Could not load plan details."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("gives an inactive plan a real checkout action", async () => {
    vi.mocked(consumerFinanceApi.entitlements).mockResolvedValue({
      tier: "FREE",
      capabilities: ["AI_INPUT", "RECEIPT_SCAN"],
      usage: [
        {
          feature: "AI_INPUT",
          used: 7,
          limit: 10,
          remaining: 3,
          resetAt: null,
        },
        {
          feature: "RECEIPT_SCAN",
          used: 2,
          limit: 3,
          remaining: 1,
          resetAt: null,
        },
      ],
      activeUntil: null,
      cancelAtPeriodEnd: false,
    });
    vi.mocked(consumerFinanceApi.billing).mockResolvedValue({
      plans: [
        {
          id: "plan",
          code: "PRO",
          name: "Pro",
          prices: [
            {
              id: "price",
              currency: "USD",
              interval: "MONTH",
              amountMinor: 500,
              version: 1,
            },
          ],
        },
      ],
      subscriptions: [],
      providers: [
        {
          provider: "STRIPE",
          mode: "TEST",
          capabilities: { intervals: ["MONTH"] },
        },
      ],
    });
    renderSettings();
    expect(
      await screen.findByRole("button", { name: "Upgrade to Finance Pro" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Finance Free")).toBeInTheDocument();
    expect(screen.getByText("7/10")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });
});
