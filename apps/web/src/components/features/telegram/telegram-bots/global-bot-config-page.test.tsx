import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalBotConfigPage } from "./global-bot-config-page";

const apiMocks = vi.hoisted(() => ({
  workspaceProviders: vi.fn(),
  saveWorkspaceProvider: vi.fn(),
  removeWorkspaceProvider: vi.fn(),
  workspaceAi: vi.fn(),
  saveWorkspaceAi: vi.fn(),
  validateWorkspaceAi: vi.fn(),
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/lib/features/finance/bot-billing-api", () => ({
  botBillingApi: {
    workspaceProviders: apiMocks.workspaceProviders,
    saveWorkspaceProvider: apiMocks.saveWorkspaceProvider,
    removeWorkspaceProvider: apiMocks.removeWorkspaceProvider,
  },
  financeAiConfigApi: {
    workspace: apiMocks.workspaceAi,
    saveWorkspace: apiMocks.saveWorkspaceAi,
    validateWorkspace: apiMocks.validateWorkspaceAi,
  },
}));

const capabilities = {
  recurring: true,
  intervals: ["MONTH" as const],
  coupons: false,
  refunds: false,
};
const provider = (
  providerName: "STRIPE" | "TELEGRAM_STARS",
  mode: "TEST" | "LIVE",
  status: "NOT_CONFIGURED" | "CONNECTED" = "NOT_CONFIGURED",
) => ({
  provider: providerName,
  mode,
  status,
  source:
    status === "CONNECTED" ? ("WORKSPACE_DEFAULT" as const) : ("NONE" as const),
  publicKeyConfigured: false,
  secretKeyConfigured: false,
  webhookSecretConfigured: false,
  capabilities,
});

describe("GlobalBotConfigPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.workspaceProviders.mockResolvedValue([
      provider("STRIPE", "TEST"),
      provider("STRIPE", "LIVE"),
      provider("TELEGRAM_STARS", "TEST"),
      provider("TELEGRAM_STARS", "LIVE", "CONNECTED"),
    ]);
    apiMocks.workspaceAi.mockResolvedValue({
      provider: "OPENAI",
      source: "WORKSPACE_DEFAULT",
      status: "CONNECTED",
      apiKeyConfigured: true,
      lastCheckedAt: null,
      lastValidationError: null,
    });
    apiMocks.removeWorkspaceProvider.mockResolvedValue(
      provider("TELEGRAM_STARS", "LIVE"),
    );
  });

  it("shows readable states and the global provider identity", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <GlobalBotConfigPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Global bot configuration"),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Connect the provider once/)).toBeInTheDocument();
    expect(screen.queryByText("NOT_CONFIGURED")).not.toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("disables Telegram Stars from the switch", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <GlobalBotConfigPage />
      </QueryClientProvider>,
    );
    const toggle = await screen.findByRole("button", {
      name: /accept telegram stars/i,
    });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(apiMocks.removeWorkspaceProvider).toHaveBeenCalledWith(
        "TELEGRAM_STARS",
        "LIVE",
      ),
    );
  });
});
