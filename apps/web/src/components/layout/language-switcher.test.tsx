import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceDisplayProvider, useFinanceDisplay } from "@/providers/finance-display-provider";
import { FinanceAccountTotal } from "@/components/features/finance/internal/finance-account-total";
import { formatFinanceAmount } from "@/lib/features/finance/money";
import { LanguageSwitcher } from "./language-switcher";

const mocks = vi.hoisted(() => ({
  updateLocale: vi.fn(),
  setLocale: vi.fn(),
  balances: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  accountApi: { updateLocale: mocks.updateLocale },
  accountsApi: { balances: mocks.balances },
  currenciesApi: {
    listLatestRates: async () => [{ id: "rate", baseCurrency: "PLN", targetCurrency: "UAH", rate: 10 }],
  },
}));

vi.mock("@/providers/i18n-provider", () => ({
  useOptionalI18n: () => null,
  useI18n: () => ({
    locale: "en",
    setLocale: mocks.setLocale,
    t: (key: string) =>
      ({
        "navigation.regionalPreferences": "Language and currency",
        "navigation.displayCurrency": "Display currency",
        "navigation.language": "Language",
        "navigation.english": "English",
        "navigation.russian": "Русский",
      })[key] || key,
  }),
}));

function ActiveCurrency() {
  return <output aria-label="Current display currency">{useFinanceDisplay().currency}</output>;
}

function renderSwitcher(workspaceId = "workspace", canChoose = false) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  queryClient.setQueryData(["account-me"], { id: "user-1", locale: "en" });
  render(
    <QueryClientProvider client={queryClient}>
      <FinanceDisplayProvider userId="user-1" workspaceId={workspaceId} primaryCurrency="UAH" canChoose={canChoose} loadRates={canChoose}>
        <LanguageSwitcher />
        <ActiveCurrency />
        {canChoose ? <FinanceAccountTotal scope="mine" /> : null}
      </FinanceDisplayProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.balances.mockReset().mockResolvedValue([
      { currency: "UAH", balance: 100 },
      { currency: "PLN", balance: 25 },
    ]);
    mocks.updateLocale.mockReset();
    mocks.setLocale.mockReset().mockResolvedValue(undefined);
  });

  it("switches immediately and persists through the narrow locale endpoint", async () => {
    mocks.updateLocale.mockResolvedValue({ locale: "ru" });
    const queryClient = renderSwitcher();

    fireEvent.click(screen.getByRole("button", { name: "Language and currency" }));
    expect(mocks.setLocale).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /English/ })).toHaveClass("border-blue-500");
    fireEvent.click(screen.getByRole("button", { name: /Русский/ }));

    await waitFor(() => expect(mocks.setLocale).toHaveBeenCalledWith("ru"));
    expect(mocks.updateLocale).toHaveBeenCalledWith("ru");
    expect(queryClient.getQueryData(["account-me"])).toEqual(
      expect.objectContaining({ locale: "ru" }),
    );
  });

  it("changes the display currency from the anchored panel and keeps it scoped to the workspace", async () => {
    renderSwitcher("first", true);
    expect(screen.getByLabelText("Current display currency")).toHaveTextContent("UAH");
    await waitFor(() => expect(screen.getByLabelText("Total").textContent).toBe(formatFinanceAmount(350, "UAH")));
    const trigger = screen.getByRole("button", { name: "Language and currency: UAH" });
    expect(trigger).toHaveTextContent(/^🇺🇦UAH$/);
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Language and currency" });
    expect(panel).not.toHaveAttribute("aria-modal");
    expect(trigger.parentElement).toContainElement(panel);
    const currencies = within(panel).getByRole("group", { name: "Display currency" });
    expect(within(currencies).getAllByRole("button")).toHaveLength(4);
    expect(within(currencies).getByRole("button", { name: "₴ · UAH", pressed: true })).toBeVisible();
    expect(within(currencies).getByRole("button", { name: "$ · USD" })).toBeVisible();
    expect(within(currencies).getByRole("button", { name: "€ · EUR" })).toBeVisible();
    fireEvent.click(within(currencies).getByRole("button", { name: "zł · PLN" }));
    expect(trigger).toHaveTextContent(/^🇵🇱PLN$/);
    expect(within(currencies).getByRole("button", { name: /PLN/i, pressed: true })).toBeVisible();
    expect(screen.getByLabelText("Current display currency")).toHaveTextContent("PLN");
    expect(screen.getByLabelText("Total").textContent).toBe(formatFinanceAmount(35, "PLN"));
    expect(mocks.balances).toHaveBeenCalledTimes(1);
    expect(mocks.balances).toHaveBeenCalledWith({ scope: "mine" });
    expect(localStorage.getItem("finance-display-currency:user-1:first")).toBe("PLN");
    expect(localStorage.getItem("finance-display-currency:user-1:second")).toBeNull();
    expect(mocks.updateLocale).not.toHaveBeenCalled();
  });

  it("dismisses on Escape or outside press, keeping keyboard focus on the trigger after Escape", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "Language and currency" });
    await user.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Language and currency" });
    expect(panel).toHaveFocus();
    expect(screen.queryByRole("group", { name: "Display currency" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(screen.getByLabelText("Current display currency"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("rolls the locale and cached preference back when persistence fails", async () => {
    mocks.updateLocale.mockRejectedValue(new Error("offline"));
    const queryClient = renderSwitcher();

    fireEvent.click(screen.getByRole("button", { name: "Language and currency" }));
    fireEvent.click(screen.getByRole("button", { name: /Русский/ }));

    await waitFor(() =>
      expect(mocks.setLocale).toHaveBeenNthCalledWith(2, "en"),
    );
    expect(queryClient.getQueryData(["account-me"])).toEqual(
      expect.objectContaining({ locale: "en" }),
    );
  });
});
