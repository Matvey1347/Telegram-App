import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceRootApp } from "./finance-root-app";

vi.mock("@finance-web/components/groshly-finance-app", () => ({
  GroshlyFinanceApp: ({ botId }: { botId: string }) => <div>Finance application {botId}</div>,
}));

describe("FinanceRootApp", () => {
  afterEach(() => {
    window.localStorage.clear();
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
      json: async () => ({ financeBotId: "finance-primary" }),
    }));

    render(<FinanceRootApp />);

    expect(screen.queryByText(/Finance application/)).not.toBeInTheDocument();
    expect(await screen.findByText("Finance application finance-primary")).toBeInTheDocument();
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

  it("uses the bot id from a Telegram Mini App route without resolving another runtime", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;

    render(<FinanceRootApp botId="telegram-menu-bot" />);

    expect(screen.getByText("Finance application telegram-menu-bot")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
