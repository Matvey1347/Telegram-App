import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { FinanceAccountCenter } from "./finance-account-center";

const api = vi.hoisted(() => ({ updateSettings: vi.fn() }));
vi.mock("@/lib/features/finance/consumer-finance-profile-api", () => ({
  consumerFinanceProfileApi: api,
}));
vi.mock("./finance-settings", () => ({
  FinanceSettings: () => <div>Finance preferences</div>,
}));
vi.mock("./finance-plans", () => ({
  FinancePlans: () => <div>Billing and payments</div>,
}));

const profile = {
  id: "profile-1",
  defaultCurrency: "USD",
  timezone: "UTC",
  locale: "en" as const,
  telegramUser: {
    displayName: "Ada Lovelace",
    username: "ada",
    avatarUrl: null,
  },
};

describe("FinanceAccountCenter", () => {
  it("updates the Finance display name and includes settings and billing", async () => {
    const profileWithOverride = {
      ...profile,
      displayNameOverride: "Ada Finance",
      telegramUser: { ...profile.telegramUser, displayName: "Ada Finance" },
    };
    const updated = {
      ...profileWithOverride,
      displayNameOverride: "Ada Money",
      telegramUser: { ...profile.telegramUser, displayName: "Ada Money" },
    };
    api.updateSettings.mockResolvedValue(updated);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <FinanceAccountCenter
          botId="bot"
          profile={profileWithOverride}
          locale="en"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Finance preferences")).toBeInTheDocument();
    expect(screen.getByText("Billing and payments")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada Finance");
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Ada Money" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(api.updateSettings).toHaveBeenCalledWith("bot", {
        defaultCurrency: "USD",
        timezone: "UTC",
        displayName: "Ada Money",
      }),
    );
    expect(client.getQueryData(consumerFinanceKeys.session("bot"))).toEqual({
      authenticated: true,
      profile: updated,
    });
  });
});
