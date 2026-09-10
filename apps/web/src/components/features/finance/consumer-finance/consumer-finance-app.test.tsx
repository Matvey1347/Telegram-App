import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { ConsumerFinanceApp } from "./consumer-finance-app";

const mocks = vi.hoisted(() => ({
  bootstrap: { status: "browser" } as
    | { status: "browser" | "loading" | "error" }
    | { status: "ready"; initData: string },
  auth: vi.fn(),
  session: vi.fn(),
  createBrowserTransfer: vi.fn(),
  logout: vi.fn(),
  browserTransferUrl: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("./use-telegram-mini-app-bootstrap", () => ({
  useTelegramMiniAppBootstrap: () => mocks.bootstrap,
}));
vi.mock("@/lib/features/finance/consumer-finance-auth-api", () => ({
  consumerFinanceAuthApi: {
    auth: mocks.auth,
    session: mocks.session,
    createBrowserTransfer: mocks.createBrowserTransfer,
    browserTransferUrl: mocks.browserTransferUrl,
    logout: mocks.logout,
  },
}));
vi.mock("@/lib/features/finance/consumer-finance-profile-api", () => ({
  consumerFinanceProfileApi: {
    updateSettings: mocks.updateSettings,
  },
}));
vi.mock("./consumer-finance-screens", () => ({
  ConsumerFinanceScreens: ({
    profile,
    screen: activeScreen,
    openTransfer,
    openTransaction,
    actionRequestId,
    surface,
    accountId,
    regularPaymentTarget,
    regularPaymentTargetMalformed,
    onAccountEdit,
    onAccountBack,
  }: {
    profile: ConsumerFinanceProfile;
    screen: string;
    openTransfer: boolean;
    openTransaction: "EXPENSE" | "INCOME" | null;
    actionRequestId: number;
    surface: "browser" | "telegram";
    accountId: string | null;
    regularPaymentTarget: {
      regularPaymentId: string;
      occurrenceAt: string;
      expectedVersion: number;
    } | null;
    regularPaymentTargetMalformed: boolean;
    onAccountEdit: (accountId: string) => void;
    onAccountBack: () => void;
  }) => (
    <div>
      Finance profile {profile.id} · screen {activeScreen} · transfer{" "}
      {String(openTransfer)} · transaction {String(openTransaction)} · surface{" "}
      {surface} · account {String(accountId)} · request {actionRequestId}
      {regularPaymentTarget
        ? ` · target ${regularPaymentTarget.regularPaymentId}`
        : ""}
      {regularPaymentTargetMalformed ? " · malformed target" : ""}
      {activeScreen === "accounts" ? (
        <button onClick={() => onAccountEdit("account-1")}>
          Open test account
        </button>
      ) : null}
      {activeScreen === "account" ? (
        <button onClick={onAccountBack}>Back to accounts</button>
      ) : null}
    </div>
  ),
}));
vi.mock("./consumer-finance-login", () => ({
  ConsumerFinanceLogin: () => <div>Browser login</div>,
  ConsumerFinanceBootstrapError: ({
    onRetry,
    locale,
  }: {
    onRetry: () => void;
    locale?: string;
  }) => <button onClick={onRetry}>Bootstrap retry {locale}</button>,
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
    avatarUrl: "https://t.me/i/userpic/320/ada_lovelace.jpg",
  },
};

function renderApp(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  }),
) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ConsumerFinanceApp botId="bot-1" />
      </QueryClientProvider>,
    ),
  };
}

function appElement(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <ConsumerFinanceApp botId="bot-1" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.bootstrap = { status: "browser" };
  mocks.auth.mockReset();
  mocks.session.mockReset();
  mocks.session.mockResolvedValue({ authenticated: false });
  mocks.createBrowserTransfer.mockReset();
  mocks.browserTransferUrl.mockReset();
  mocks.updateSettings.mockReset();
  mocks.logout.mockReset();
  mocks.logout.mockResolvedValue({ authenticated: false });
  mocks.updateSettings.mockResolvedValue(profile);
  window.localStorage.clear();
  window.history.replaceState({}, "", "/finance/bot-1");
});

describe("ConsumerFinanceApp bootstrap", () => {
  it("hydrates the immediate Finance shell with a remembered browser locale", async () => {
    mocks.bootstrap = { status: "loading" };
    window.localStorage.setItem("consumer-finance-locale:bot-1", "ru");
    const browserWindow = window;
    const serverClient = new QueryClient();
    vi.stubGlobal("window", undefined);
    const serverHtml = renderToString(appElement(serverClient));
    vi.stubGlobal("window", browserWindow);

    expect(serverHtml).toContain("Opening Finance…");
    expect(serverHtml).toContain('data-finance-shell="web-app"');
    expect(serverHtml).not.toContain('data-finance-shell="bootstrap"');
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, appElement(new QueryClient()));
      await Promise.resolve();
    });

    expect(container).toHaveTextContent("Открываем Финансы…");
    expect(
      consoleError.mock.calls.some((call) =>
        call.some((value) => String(value).includes("Hydration failed")),
      ),
    ).toBe(false);

    await act(async () => root?.unmount());
    consoleError.mockRestore();
    container.remove();
  });

  it("hydrates a direct Plans URL before applying the browser route", async () => {
    mocks.bootstrap = { status: "browser" };
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    window.history.replaceState({}, "", "/finance/bot-1?screen=billing");
    const browserWindow = window;
    const serverClient = new QueryClient();
    vi.stubGlobal("window", undefined);
    const serverHtml = renderToString(appElement(serverClient));
    vi.stubGlobal("window", browserWindow);

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, appElement(new QueryClient()));
      await Promise.resolve();
    });

    await waitFor(() => expect(container).toHaveTextContent("screen billing"));
    expect(
      consoleError.mock.calls.some((call) =>
        call.some((value) => String(value).includes("Hydration failed")),
      ),
    ).toBe(false);

    await act(async () => root?.unmount());
    consoleError.mockRestore();
    container.remove();
  });

  it("renders the Finance shell immediately while the runtime surface is detected", () => {
    mocks.bootstrap = { status: "loading" };

    renderApp();

    expect(
      document.querySelector("[data-finance-shell='bootstrap']"),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-shell='mini-app']"),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-shell='web-app']"),
    ).toBeInTheDocument();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(
      document.querySelector(
        "[data-finance-feedback='loading'] [data-finance-context='overview'] svg",
      ),
    ).toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("performs one browser session read and renders login only for explicit unauthenticated state", async () => {
    mocks.session.mockResolvedValue({ authenticated: false });

    renderApp();

    expect(await screen.findByText("Browser login")).toBeInTheDocument();
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("opens Finance from an existing browser session", async () => {
    mocks.session.mockResolvedValue({ authenticated: true, profile });

    renderApp();

    expect(
      await screen.findByText(/Finance profile profile-1/),
    ).toBeInTheDocument();
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(
      document.querySelector("[data-finance-surface='browser']"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-shell='web-app']"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-shell='mini-app']"),
    ).not.toBeInTheDocument();
    const sidebar = screen
      .getAllByRole("navigation", { name: "Finance navigation" })
      .map((navigation) => navigation.closest("aside"))
      .find(Boolean);
    expect(sidebar).toHaveClass("h-dvh", "overflow-hidden");
    expect(within(sidebar as HTMLElement).getByText("Finance")).toBeVisible();
    expect(
      within(sidebar as HTMLElement).queryByText("Ada Lovelace"),
    ).not.toBeInTheDocument();
    expect(
      within(sidebar as HTMLElement).queryByRole("button", {
        name: "Language",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Language" })).toBeVisible();
    expect(
      document.querySelector("[data-finance-screen-icon='home']"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Ada Lovelace")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open account menu" }),
    ).toBeVisible();
    expect(within(sidebar as HTMLElement).getByText("Summary")).toBeVisible();
    expect(within(sidebar as HTMLElement).getByText("Money")).toBeVisible();
    expect(within(sidebar as HTMLElement).getByText("Planning")).toBeVisible();
    expect(within(sidebar as HTMLElement).getByText("Service")).toBeVisible();
    const moneyGroup = within(sidebar as HTMLElement).getByRole("button", {
      name: "Money",
    });
    expect(moneyGroup).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(moneyGroup);
    expect(moneyGroup).toHaveAttribute("aria-expanded", "false");
    expect(
      within(sidebar as HTMLElement).queryByRole("button", {
        name: "Transactions",
      }),
    ).toBeNull();
    fireEvent.click(moneyGroup);
    expect(
      within(sidebar as HTMLElement).getByRole("button", {
        name: "Transactions",
      }),
    ).toBeVisible();
  });

  it("checks the scoped session before using Telegram initData once", async () => {
    mocks.bootstrap = { status: "ready", initData: "signed-init-data" };
    mocks.auth.mockResolvedValue({ authenticated: true, profile });

    renderApp();

    expect(
      await screen.findByText(/Finance profile profile-1/),
    ).toBeInTheDocument();
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.auth).toHaveBeenCalledWith("bot-1", "signed-init-data");
    expect(mocks.session).toHaveBeenCalledOnce();
  });

  it("keeps an existing Mini App session without replaying stale initData", async () => {
    mocks.bootstrap = { status: "ready", initData: "expired-init-data" };
    mocks.session.mockResolvedValue({ authenticated: true, profile });

    renderApp();

    expect(
      await screen.findByText(/Finance profile profile-1/),
    ).toBeInTheDocument();
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("keeps a failed Telegram bootstrap stable and retries once per click", async () => {
    mocks.bootstrap = { status: "ready", initData: "expired-init-data" };
    mocks.auth.mockRejectedValue(new Error("expired"));

    renderApp();

    const retry = await screen.findByRole("button", {
      name: "Bootstrap retry en",
    });
    expect(mocks.auth).toHaveBeenCalledOnce();
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(mocks.auth).toHaveBeenCalledOnce();

    fireEvent.click(retry);
    await waitFor(() => expect(mocks.auth).toHaveBeenCalledTimes(2));
    expect(mocks.session).toHaveBeenCalledTimes(2);
  });

  it("renders a recoverable Telegram context error without browser login or requests", () => {
    mocks.bootstrap = { status: "error" };

    renderApp();

    expect(
      screen.getByRole("button", { name: "Bootstrap retry en" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Browser login")).not.toBeInTheDocument();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("keeps the last profile locale for a localized bootstrap error", () => {
    window.localStorage.setItem("consumer-finance-locale:bot-1", "ru");
    mocks.bootstrap = { status: "error" };

    renderApp();

    expect(
      screen.getByRole("button", { name: "Bootstrap retry ru" }),
    ).toBeInTheDocument();
  });

  it("renders the Telegram shell with four primary mobile destinations", async () => {
    mocks.bootstrap = { status: "ready", initData: "signed-init-data" };
    mocks.auth.mockResolvedValue({ authenticated: true, profile });

    renderApp();

    await screen.findByText(/Finance profile profile-1/);
    expect(
      document.querySelector("[data-finance-surface='telegram']"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-shell='mini-app']"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open in browser" }),
    ).toBeInTheDocument();
    const mobileNav = document.querySelector("nav.grid-cols-4");
    expect(mobileNav).toBeInTheDocument();
    expect(
      within(mobileNav as HTMLElement).getAllByRole("button"),
    ).toHaveLength(4);
  });

  it("keeps Debts and Regular payments reachable from the Mini App menu", async () => {
    mocks.bootstrap = { status: "ready", initData: "signed-init-data" };
    mocks.auth.mockResolvedValue({ authenticated: true, profile });
    renderApp();
    await screen.findByText(/screen home/);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Debts" }));
    expect(await screen.findByText(/screen debts/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Regular payments" }));
    expect(
      await screen.findByText(/screen regular-payments/),
    ).toBeInTheDocument();
  });

  it("changes the Finance language from the Mini App header", async () => {
    mocks.bootstrap = { status: "ready", initData: "signed-init-data" };
    mocks.auth.mockResolvedValue({ authenticated: true, profile });
    mocks.updateSettings.mockResolvedValue({ ...profile, locale: "uk" });

    const { client } = renderApp();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await screen.findByText(/Finance profile profile-1/);
    expect(screen.getByText("🇬🇧")).toBeInTheDocument();
    const languageButton = screen.getByRole("button", { name: "Language" });
    expect(languageButton).toHaveClass("min-h-11");
    expect(languageButton).toHaveClass("!w-[4.75rem]");
    fireEvent.click(languageButton);
    const ukrainian = screen.getByRole("option", { name: "Ukrainian" });
    expect(within(ukrainian).getByText("Ukrainian")).toHaveClass("sr-only");
    fireEvent.click(ukrainian);
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith("bot-1", {
        defaultCurrency: "USD",
        timezone: "UTC",
        locale: "uk",
      }),
    );
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: consumerFinanceKeys.dashboard("bot-1"),
    });
  });

  it("persists a flag-only language selected in the browser header", async () => {
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    mocks.updateSettings.mockResolvedValue({ ...profile, locale: "uk" });
    renderApp();

    await screen.findByText(/Finance profile profile-1/);
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    const ukrainian = screen.getByRole("option", { name: "Ukrainian" });
    expect(within(ukrainian).getByText("Ukrainian")).toHaveClass("sr-only");
    fireEvent.click(ukrainian);

    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith("bot-1", {
        defaultCurrency: "USD",
        timezone: "UTC",
        locale: "uk",
      }),
    );
  });

  it("reports when language synchronization fails", async () => {
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    mocks.updateSettings.mockRejectedValue(new Error("offline"));
    renderApp();

    await screen.findByText(/Finance profile profile-1/);
    fireEvent.click(screen.getByRole("button", { name: "Language" }));
    fireEvent.click(screen.getByRole("option", { name: "Ukrainian" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Language could not be synchronized. Please try again.",
    );
  });

  it("keeps browser-session transfer failure recoverable", async () => {
    mocks.bootstrap = { status: "ready", initData: "signed-init-data" };
    mocks.auth.mockResolvedValue({ authenticated: true, profile });
    mocks.createBrowserTransfer.mockRejectedValue(new Error("offline"));

    renderApp();

    fireEvent.click(
      await screen.findByRole("button", { name: "Open in browser" }),
    );
    expect(
      await screen.findByText(
        "Could not open the browser session. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open in browser" }),
    ).toBeEnabled();
  });

  it("keeps the full Finance shell visible while session data loads", () => {
    mocks.session.mockReturnValue(new Promise(() => undefined));

    renderApp();

    expect(
      document.querySelector("[data-finance-shell='bootstrap']"),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-shell='web-app']"),
    ).toBeInTheDocument();
    expect(
      document.querySelector(
        "[data-finance-feedback='loading'] [data-finance-context='overview'] svg",
      ),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-context='overview']"),
    ).toHaveAttribute("data-finance-compact", "false");
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it.each([
    { route: "categories", expected: "categories" },
    { route: "budget", expected: "budget" },
    { route: "ultimate", expected: "analytics" },
    { route: "reminders", expected: "reminders" },
    { route: "billing", expected: "billing" },
  ] as const)(
    "preserves the $route direct route",
    async ({ route, expected }) => {
      window.history.replaceState({}, "", `/finance/bot-1?screen=${route}`);
      mocks.session.mockResolvedValue({ authenticated: true, profile });

      renderApp();

      expect(
        await screen.findByText(new RegExp(`screen ${expected}`)),
      ).toBeInTheDocument();
    },
  );

  it("updates browser URLs on navigation and follows popstate history", async () => {
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    renderApp();
    await screen.findByText(/screen home/);

    fireEvent.click(screen.getAllByRole("button", { name: "Transactions" })[0]);
    expect(await screen.findByText(/screen transactions/)).toBeInTheDocument();
    expect(window.location.search).toBe("?screen=transactions");

    act(() => {
      window.history.pushState({}, "", "/finance/bot-1?screen=budget");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByText(/screen budget/)).toBeInTheDocument();
  });

  it("preserves account editor deep links and follows account popstate", async () => {
    window.history.replaceState(
      {},
      "",
      "/finance/bot-1?screen=account&accountId=account-1",
    );
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    renderApp();

    expect(
      await screen.findByText(/screen account.+account account-1/),
    ).toBeInTheDocument();

    act(() => {
      window.history.pushState({}, "", "/finance/bot-1?screen=accounts");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByText(/screen accounts/)).toBeInTheDocument();
  });

  it("pushes an editor URL and explicit Back restores the accounts entry", async () => {
    window.history.replaceState(
      { consumerFinanceScreen: "accounts" },
      "",
      "/finance/bot-1?screen=accounts",
    );
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    renderApp();
    await screen.findByText(/screen accounts/);

    fireEvent.click(screen.getByRole("button", { name: "Open test account" }));
    expect(await screen.findByText(/screen account/)).toBeInTheDocument();
    expect(window.location.search).toBe("?screen=account&accountId=account-1");
    for (const accountsNav of screen.getAllByRole("button", {
      name: "Accounts",
    })) {
      expect(accountsNav).toHaveAttribute("aria-current", "page");
      expect(accountsNav).toHaveClass("text-sky-200");
    }

    fireEvent.click(screen.getByRole("button", { name: "Back to accounts" }));
    await waitFor(() =>
      expect(window.location.search).toBe("?screen=accounts"),
    );
    expect(await screen.findByText(/screen accounts/)).toBeInTheDocument();
  });

  it("keeps secondary routes reachable and launches transfers directly", async () => {
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    renderApp();
    await screen.findByText(/screen home/);

    fireEvent.click(screen.getAllByRole("button", { name: "Expense" })[0]);
    expect(
      await screen.findByText(
        /screen transactions · transfer false · transaction EXPENSE/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Transfers" })[1]);
    expect(
      await screen.findByText(/screen transfers · transfer true/),
    ).toBeInTheDocument();
    expect(window.location.search).toContain("transfer=1");
  });

  it("navigates to Debts and Regular payments in the Web shell", async () => {
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    renderApp();
    await screen.findByText(/screen home/);

    fireEvent.click(screen.getAllByRole("button", { name: "Debts" })[0]);
    expect(await screen.findByText(/screen debts/)).toBeInTheDocument();
    expect(window.location.search).toBe("?screen=debts");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Regular payments" })[0],
    );
    expect(
      await screen.findByText(/screen regular-payments/),
    ).toBeInTheDocument();
    expect(window.location.search).toBe("?screen=regular-payments");
  });

  it("passes a valid or malformed regular notification target recoverably", async () => {
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    window.history.replaceState(
      {},
      "",
      "/finance/bot-1?screen=regular-payments&regularPaymentId=rent&occurrenceAt=2026-09-08T08%3A00%3A00.000Z&configVersion=7",
    );
    const valid = renderApp();
    expect(await screen.findByText(/target rent/)).toBeInTheDocument();
    valid.unmount();

    window.history.replaceState(
      {},
      "",
      "/finance/bot-1?screen=regular-payments&regularPaymentId=rent",
    );
    renderApp();
    expect(await screen.findByText(/malformed target/)).toBeInTheDocument();
  });

  it("issues a fresh request for repeated expense and transfer actions", async () => {
    mocks.session.mockResolvedValue({ authenticated: true, profile });
    renderApp();
    await screen.findByText(/screen home/);

    fireEvent.click(screen.getAllByRole("button", { name: "Expense" })[0]);
    expect(
      await screen.findByText(/transaction EXPENSE.+request 1/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Expense" })[0]);
    expect(
      await screen.findByText(/transaction EXPENSE.+request 2/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Transfers" })[1]);
    expect(
      await screen.findByText(/transfer true.+request 3/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Transfers" })[1]);
    expect(
      await screen.findByText(/transfer true.+request 4/),
    ).toBeInTheDocument();
  });
});
