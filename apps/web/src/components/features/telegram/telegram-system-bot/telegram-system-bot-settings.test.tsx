import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramSystemBotApi } from "@/lib/api";
import { TelegramSystemBotSettings } from "./telegram-system-bot-settings";

vi.mock("@/lib/api", () => ({
  telegramSystemBotApi: {
    connection: vi.fn(),
    disconnect: vi.fn(),
  },
}));

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TelegramSystemBotSettings />
    </QueryClientProvider>,
  );
}

describe("TelegramSystemBotSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the configured bot with a connect start parameter", async () => {
    vi.mocked(telegramSystemBotApi.connection).mockResolvedValue({
      connected: false,
      username: null,
      firstName: null,
      connectedAt: null,
      currentWorkspaceId: null,
      currentWorkspaceName: null,
      botUsername: "TgBusinessSystemAn_bot",
    });

    renderSettings();

    expect(
      await screen.findByRole("link", { name: "Connect" }),
    ).toHaveAttribute(
      "href",
      "https://t.me/TgBusinessSystemAn_bot?start=connect",
    );
  });

  it("keeps Connect visible but disabled when the bot is not configured", async () => {
    vi.mocked(telegramSystemBotApi.connection).mockResolvedValue({
      connected: false,
      username: null,
      firstName: null,
      connectedAt: null,
      currentWorkspaceId: null,
      currentWorkspaceName: null,
      botUsername: null,
    });

    renderSettings();

    expect(
      await screen.findByRole("button", { name: "Connect" }),
    ).toBeDisabled();
  });

  it("moves connected account actions into the overflow menu", async () => {
    vi.mocked(telegramSystemBotApi.connection).mockResolvedValue({
      connected: true,
      username: "matviikpr",
      firstName: "Matvii",
      connectedAt: "2026-08-09T11:00:00.000Z",
      currentWorkspaceId: "workspace-1",
      currentWorkspaceName: "Business",
      botUsername: "TgBusinessSystemAn_bot",
      runtimeEnvironment: "LOCAL",
    });

    renderSettings();

    expect(await screen.findByText("Bot active")).toBeInTheDocument();
    expect(screen.getByText("Nexeloq Bot")).toBeInTheDocument();
    expect(screen.getByText(/@TgBusinessSystemAn_bot/)).toBeInTheDocument();
    expect(screen.queryByText("@matviikpr")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Telegram System Bot actions" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Open bot" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Disconnect" }),
    ).toBeInTheDocument();
  });

  it("does not poll an unconnected status and offers an explicit refresh", async () => {
    vi.mocked(telegramSystemBotApi.connection)
      .mockResolvedValueOnce({
        connected: false,
        username: null,
        firstName: null,
        connectedAt: null,
        currentWorkspaceId: null,
        currentWorkspaceName: null,
        botUsername: "TgBusinessSystemAn_bot",
      })
      .mockResolvedValueOnce({
        connected: true,
        username: "matviikpr",
        firstName: "Matvii",
        connectedAt: "2026-08-09T11:00:00.000Z",
        currentWorkspaceId: "workspace-1",
        currentWorkspaceName: "Business",
        botUsername: "TgBusinessSystemAn_bot",
      });

    renderSettings();
    expect(await screen.findByText("Bot unavailable")).toBeInTheDocument();

    expect(telegramSystemBotApi.connection).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Telegram System Bot actions" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Refresh connection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/personal connection is only needed/i),
    ).toBeInTheDocument();
  });

  it("labels both isolated environments and explains that credentials are read-only", async () => {
    vi.mocked(telegramSystemBotApi.connection).mockResolvedValue({
      connected: false,
      username: null,
      firstName: null,
      connectedAt: null,
      currentWorkspaceId: null,
      currentWorkspaceName: null,
      botUsername: "TgBusinessSystemAn_bot",
    });

    renderSettings();

    expect(
      await screen.findByText("Production"),
    ).toBeInTheDocument();
    expect(screen.getByText("Local development")).toBeInTheDocument();
    expect(
      screen.getByText(/credentials are managed through the environment/i),
    ).toBeInTheDocument();
  });

  it("identifies the current API process environment from the connection read model", async () => {
    vi.mocked(telegramSystemBotApi.connection).mockResolvedValue({
      connected: false,
      username: null,
      firstName: null,
      connectedAt: null,
      currentWorkspaceId: null,
      currentWorkspaceName: null,
      botUsername: "TgBusinessSystemAn_bot",
      runtimeEnvironment: "LOCAL",
    });

    renderSettings();
    expect(await screen.findByText("Current process")).toBeInTheDocument();
    expect(
      screen.getByText(/local is active for this api process/i),
    ).toBeInTheDocument();
  });

  it("shows a compact actionable error state without rendering environment placeholders", async () => {
    vi.mocked(telegramSystemBotApi.connection).mockRejectedValue(
      new Error("API unavailable"),
    );

    renderSettings();

    expect(
      await screen.findByText("Connection status is unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Production")).not.toBeInTheDocument();
  });
});
