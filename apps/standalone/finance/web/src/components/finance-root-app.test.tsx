import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceRootApp } from "./finance-root-app";

vi.mock("@finance-web/components/groshly-finance-app", () => ({
  GroshlyFinanceApp: () => <div>Finance application</div>,
}));

describe("FinanceRootApp", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses the single Groshly loading screen before context resolves", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;

    render(<FinanceRootApp />);

    expect(screen.getByTestId("groshly-loading")).toHaveTextContent(
      "Завантаження…",
    );
  });

  it("opens the cached Finance route without waiting for the context check", async () => {
    window.localStorage.setItem("finance-active-bot-id", "finance-primary");
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;

    render(<FinanceRootApp />);

    expect(screen.getByText("Finance application")).toBeInTheDocument();
    expect(screen.queryByTestId("groshly-loading")).not.toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/finance/context",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("uses the bot id from a Telegram Mini App route without resolving another runtime", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof fetch;

    render(<FinanceRootApp botId="telegram-menu-bot" />);

    expect(screen.getByText("Finance application")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("finance-active-bot-id")).toBe(
      "telegram-menu-bot",
    );
  });
});
