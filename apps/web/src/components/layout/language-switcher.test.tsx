import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "./language-switcher";

const mocks = vi.hoisted(() => ({
  updateLocale: vi.fn(),
  setLocale: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  accountApi: { updateLocale: mocks.updateLocale },
}));

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({
    locale: "en",
    setLocale: mocks.setLocale,
    t: (key: string) =>
      ({
        "navigation.language": "Language",
        "navigation.english": "English",
        "navigation.russian": "Русский",
      })[key] || key,
  }),
}));

function renderSwitcher() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  queryClient.setQueryData(["account-me"], { id: "user-1", locale: "en" });
  render(
    <QueryClientProvider client={queryClient}>
      <LanguageSwitcher />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    mocks.updateLocale.mockReset();
    mocks.setLocale.mockReset().mockResolvedValue(undefined);
  });

  it("switches immediately and persists through the narrow locale endpoint", async () => {
    mocks.updateLocale.mockResolvedValue({ locale: "ru" });
    const queryClient = renderSwitcher();

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    expect(mocks.setLocale).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Русский/ }));

    await waitFor(() => expect(mocks.setLocale).toHaveBeenCalledWith("ru"));
    expect(mocks.updateLocale).toHaveBeenCalledWith("ru");
    expect(queryClient.getQueryData(["account-me"])).toEqual(
      expect.objectContaining({ locale: "ru" }),
    );
  });

  it("rolls the locale and cached preference back when persistence fails", async () => {
    mocks.updateLocale.mockRejectedValue(new Error("offline"));
    const queryClient = renderSwitcher();

    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Русский/ }));

    await waitFor(() =>
      expect(mocks.setLocale).toHaveBeenNthCalledWith(2, "en"),
    );
    expect(queryClient.getQueryData(["account-me"])).toEqual(
      expect.objectContaining({ locale: "en" }),
    );
  });
});
