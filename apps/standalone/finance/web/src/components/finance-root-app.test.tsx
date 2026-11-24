import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceRootApp } from "./finance-root-app";

vi.mock("@finance-web/components/groshly-finance-app", () => ({
  GroshlyFinanceApp: ({ botId, bootstrap, supportBotUsername }: { botId: string; bootstrap: { initData?: string }; supportBotUsername?: string }) => (
    <div><span>Finance application {botId}</span>{supportBotUsername && <span>{supportBotUsername}</span>}{bootstrap.initData && <span>Telegram launch ready</span>}</div>
  ),
}));
vi.mock("@consumer-finance/web/components/app/consumer-finance-login", () => ({
  ConsumerFinanceLogin: () => <button>Browser sign in</button>,
}));

describe("FinanceRootApp", () => {
  afterEach(() => {
    window.localStorage.clear();
    delete window.Telegram;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the single Groshly loading screen before context resolves", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;

    render(<FinanceRootApp />);

    expect(screen.getByTestId("groshly-loading")).toHaveTextContent(
      "Завантаження…",
    );
  });

  it("waits for the server-selected bot even when an older bot id is cached", async () => {
    window.localStorage.setItem("finance-active-bot-id", "stale-bot");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ financeBotId: "finance-primary", supportBotUsername: "groshly_help_bot" }),
    }));

    render(<FinanceRootApp />);

    expect(screen.queryByText(/Finance application/)).not.toBeInTheDocument();
    expect(await screen.findByText("Finance application finance-primary")).toBeInTheDocument();
    expect(screen.getByText("groshly_help_bot")).toBeVisible();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/finance/context",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("offers a retry when the context is unavailable despite a cached bot id", async () => {
    window.localStorage.setItem("finance-active-bot-id", "stale-bot");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<FinanceRootApp />);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(/Finance application/)).not.toBeInTheDocument();
  });

  it("uses an explicit bot id without resolving another runtime", async () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;

    render(<FinanceRootApp botId="telegram-menu-bot" />);

    expect(await screen.findByText("Finance application telegram-menu-bot")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses Telegram launch data even when the Mini App opens the login route", async () => {
    window.Telegram = { WebApp: { initData: "signed-telegram-launch" } };
    render(<FinanceRootApp botId="telegram-menu-bot" entry="login" />);

    expect(await screen.findByText("Telegram launch ready")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Browser sign in" })).toBeNull();
  });
});
