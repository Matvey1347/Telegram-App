import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramUserAccount } from "@/lib/api";
import { TelegramCrmAccountCapabilitiesModal } from "./telegram-crm-account-capabilities";

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  getCapabilities: vi.fn(),
  updateCapabilities: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getSyncState: vi.fn(),
  initialSync: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  authApi: { me: mocks.me },
}));

vi.mock("@/lib/features/growth/telegram-crm-api", () => ({
  telegramCrmApi: {
    getAccountCapabilities: mocks.getCapabilities,
    updateAccountCapabilities: mocks.updateCapabilities,
    getSettings: mocks.getSettings,
    updateSettings: mocks.updateSettings,
    getAccountSyncState: mocks.getSyncState,
    initialSync: mocks.initialSync,
  },
}));

const account: TelegramUserAccount = {
  id: "account-1",
  label: "CRM account",
  apiId: "1",
  username: "crm_owner",
  isPremium: false,
  captionLengthMax: 1024,
  messageLengthMax: 4096,
  crmSyncEnabled: true,
  crmSendEnabled: false,
  mtprotoPublishingEnabled: true,
  status: "connected",
  isActive: true,
};

describe("TelegramCrmAccountCapabilitiesModal", () => {
  beforeEach(() => {
    mocks.me.mockReset().mockResolvedValue({
      workspace: {
        access: { isOwner: true, permissionKeys: [] },
      },
    });
    mocks.getCapabilities.mockReset().mockResolvedValue({
      accountId: account.id,
      crmSyncEnabled: true,
      crmSendEnabled: false,
      mtprotoPublishingEnabled: true,
    });
    mocks.updateCapabilities.mockReset().mockResolvedValue({
      accountId: account.id,
      crmSyncEnabled: true,
      crmSendEnabled: true,
      mtprotoPublishingEnabled: true,
    });
    mocks.getSettings.mockReset().mockResolvedValue({
      defaultCrmSenderAccountId: null,
    });
    mocks.updateSettings.mockReset();
    mocks.getSyncState.mockReset().mockResolvedValue({
      initialImportStatus: "COMPLETED",
      lastMeaningfulSyncAt: null,
    });
    mocks.initialSync.mockReset();
  });

  it("uses the shared toggles and saves the selected capability", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <TelegramCrmAccountCapabilitiesModal
          account={account}
          open
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const syncToggle = await screen.findByRole("button", { name: "CRM sync" });
    const sendToggle = screen.getByRole("button", { name: "CRM sender" });
    expect(syncToggle).toHaveAttribute("aria-pressed", "true");
    expect(sendToggle).toHaveAttribute("aria-pressed", "false");

    await waitFor(() => expect(sendToggle).toBeEnabled());
    fireEvent.click(sendToggle);

    await waitFor(() =>
      expect(mocks.updateCapabilities).toHaveBeenCalledWith("account-1", {
        crmSendEnabled: true,
      }),
    );
  });
});
