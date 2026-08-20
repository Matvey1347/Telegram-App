import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

  it("keeps the Disconnect icon and label on one line", async () => {
    vi.mocked(telegramSystemBotApi.connection).mockResolvedValue({
      connected: true,
      username: "matviikpr",
      firstName: "Matvii",
      connectedAt: "2026-08-09T11:00:00.000Z",
      currentWorkspaceId: "workspace-1",
      currentWorkspaceName: "Business",
      botUsername: "TgBusinessSystemAn_bot",
    });

    renderSettings();

    const button = await screen.findByRole("button", { name: "Disconnect" });
    expect(button).toHaveClass("inline-flex", "items-center", "whitespace-nowrap");
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
    expect(await screen.findByText("Not connected")).toBeInTheDocument();

    expect(telegramSystemBotApi.connection).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Refresh connection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/return here and refresh the connection status/i),
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

    expect(await screen.findByText("PRODUCTION System Bot")).toBeInTheDocument();
    expect(screen.getByText("LOCAL System Bot")).toBeInTheDocument();
    expect(
      screen.getByText(/tokens and webhook secrets are environment-managed and cannot be viewed or edited here/i),
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
      screen.getByText(/this api process is configured for local/i),
    ).toBeInTheDocument();
  });
});
