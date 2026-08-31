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
import { ConsumerFinanceApp } from "./consumer-finance-app";

const mocks = vi.hoisted(() => ({
  bootstrap: { status: "browser" } as
    | { status: "browser" | "loading" | "error" }
    | { status: "ready"; initData: string },
  auth: vi.fn(),
  session: vi.fn(),
  createBrowserTransfer: vi.fn(),
  browserTransferUrl: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("./use-telegram-mini-app-bootstrap", () => ({
  useTelegramMiniAppBootstrap: () => mocks.bootstrap,
}));
vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: {
    auth: mocks.auth,
    session: mocks.session,
    createBrowserTransfer: mocks.createBrowserTransfer,
    browserTransferUrl: mocks.browserTransferUrl,
    updateSettings: mocks.updateSettings,
  },
}));
vi.mock("./consumer-finance-screens", () => ({
  ConsumerFinanceScreens: ({
    profile,
    screen: activeScreen,
    openTransfer,
    openTransaction,
    surface,
  }: {
    profile: ConsumerFinanceProfile;
    screen: string;
    openTransfer: boolean;
    openTransaction: "EXPENSE" | "INCOME" | null;
    surface: "browser" | "telegram";
  }) => (
    <div>
      Finance profile {profile.id} · screen {activeScreen} · transfer{" "}
      {String(openTransfer)} · transaction {String(openTransaction)} · surface{" "}
      {surface}
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
};

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConsumerFinanceApp botId="bot-1" />
    </QueryClientProvider>,
  );
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
  mocks.updateSettings.mockResolvedValue(profile);
  window.localStorage.clear();
  window.history.replaceState({}, "", "/finance/bot-1");
});

describe("ConsumerFinanceApp bootstrap", () => {
  it("hydrates with a remembered browser locale without changing the SSR bootstrap", async () => {
    mocks.bootstrap = { status: "loading" };
    window.localStorage.setItem("consumer-finance-locale:bot-1", "ru");
    const browserWindow = window;
    const serverClient = new QueryClient();
    vi.stubGlobal("window", undefined);
    const serverHtml = renderToString(appElement(serverClient));
    vi.stubGlobal("window", browserWindow);

    expect(serverHtml).toContain("Opening Finance…");
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

  it("keeps SSR bootstrap neutral until the runtime surface is known", () => {
    mocks.bootstrap = { status: "loading" };

    renderApp();

    expect(
      document.querySelector("[data-finance-shell='bootstrap']"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-shell='mini-app']"),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-shell='web-app']"),
    ).not.toBeInTheDocument();
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
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

  it("changes the Finance language from the Mini App header", async () => {
    mocks.bootstrap = { status: "ready", initData: "signed-init-data" };
    mocks.auth.mockResolvedValue({ authenticated: true, profile });
    mocks.updateSettings.mockResolvedValue({ ...profile, locale: "uk" });

    renderApp();

    await screen.findByText(/Finance profile profile-1/);
    expect(screen.getByText("🇬🇧")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /EN/u }));
    fireEvent.click(screen.getByRole("button", { name: /UA/u }));
    await waitFor(() =>
      expect(mocks.updateSettings).toHaveBeenCalledWith("bot-1", {
        defaultCurrency: "USD",
        timezone: "UTC",
        locale: "uk",
      }),
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

  it("keeps the standalone shell visible while browser session data loads", () => {
    mocks.session.mockReturnValue(new Promise(() => undefined));

    renderApp();

    expect(
      document.querySelector("[data-finance-surface='browser']"),
    ).toBeInTheDocument();
    expect(screen.getByText("Opening Finance…")).toBeInTheDocument();
  });

  it.each([
    "categories",
    "budget",
    "ultimate",
    "reminders",
    "billing",
  ] as const)("preserves the %s direct route", async (route) => {
    window.history.replaceState({}, "", `/finance/bot-1?screen=${route}`);
    mocks.session.mockResolvedValue({ authenticated: true, profile });

    renderApp();

    expect(
      await screen.findByText(new RegExp(`screen ${route}`)),
    ).toBeInTheDocument();
  });

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
});
