import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import { FinanceSettings } from "./finance-settings";

const planning = vi.hoisted(() => ({ updateSettings: vi.fn() }));
const auth = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/lib/features/finance/consumer-finance-profile-api", () => ({
  consumerFinanceProfileApi: planning,
}));
vi.mock("@/lib/features/finance/consumer-finance-auth-api", () => ({
  consumerFinanceAuthApi: auth,
}));
vi.mock("./finance-privacy", () => ({
  FinancePrivacy: () => <div>Privacy controls</div>,
}));

const profile: ConsumerFinanceProfile = {
  id: "p",
  defaultCurrency: "USD",
  timezone: "UTC",
  locale: "en",
  telegramUser: {
    displayName: "Ada Lovelace",
    username: "ada_lovelace",
    avatarUrl: null,
  },
};

function renderSettings(locale: "en" | "uk" | "ru" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <FinanceSettings
          botId="bot"
          profile={{ ...profile, locale }}
          locale={locale}
        />
      </QueryClientProvider>,
    ),
  };
}

describe("FinanceSettings", () => {
  it("contains preferences and privacy without a duplicate language control", () => {
    renderSettings();

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Privacy controls")).toBeInTheDocument();
    expect(screen.queryByText("Current plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Reminder name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Language" })).toBeNull();
  });

  it("uses the localized shared timezone selector", () => {
    renderSettings("ru");

    fireEvent.click(screen.getByRole("button", { name: /UTC/u }));
    expect(screen.getByPlaceholderText("Поиск…")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("updates financial preferences without changing the shared locale", async () => {
    planning.updateSettings.mockResolvedValue(profile);
    const { client } = renderSettings();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(planning.updateSettings).toHaveBeenCalledWith("bot", {
        defaultCurrency: "USD",
        timezone: "UTC",
      }),
    );
    expect(invalidate).not.toHaveBeenCalled();
  });
});
