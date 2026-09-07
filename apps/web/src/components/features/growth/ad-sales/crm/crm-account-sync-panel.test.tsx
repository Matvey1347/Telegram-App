import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmAccountSyncPanel } from "./crm-account-sync-panel";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  updateAccountCapabilities: vi.fn(),
  initialSync: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramUserAccountsApi: { list: mocks.list },
}));

vi.mock("@/lib/features/growth/telegram-crm-api", () => ({
  telegramCrmApi: {
    updateAccountCapabilities: mocks.updateAccountCapabilities,
    initialSync: mocks.initialSync,
  },
}));

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CrmAccountSyncPanel canEdit />
    </QueryClientProvider>,
  );
}

describe("CrmAccountSyncPanel", () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue([
      {
        id: "account-1",
        label: "CRM account",
        username: "crm_owner",
        status: "connected",
        crmSyncEnabled: true,
      },
      {
        id: "account-2",
        label: "Second account",
        username: "second_owner",
        status: "connected",
        crmSyncEnabled: false,
      },
    ]);
    mocks.updateAccountCapabilities.mockReset().mockResolvedValue({});
    mocks.initialSync.mockReset().mockResolvedValue({});
  });

  it("keeps source controls in a compact modal and explains daily sync", async () => {
    renderPanel();

    expect(await screen.findByRole("button", { name: "Manage sources" })).toBeTruthy();
    expect(screen.queryByText("1 selected · automatic sync daily")).toBeNull();
    expect(screen.queryByText(/Selected MTProto accounts keep/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Manage sources" }));

    expect(screen.getByRole("dialog", { name: "Telegram CRM sources" })).toBeTruthy();
    expect(screen.getByText(/sync automatically once a day/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync" })).toBeEnabled();
  });

  it("runs manual sync only for the saved selected accounts", async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Manage sources" }));
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    await waitFor(() =>
      expect(mocks.initialSync).toHaveBeenCalledWith("account-1"),
    );
    expect(mocks.initialSync).toHaveBeenCalledTimes(1);
  });

  it("keeps a visible retry-safe alert when synchronization fails", async () => {
    mocks.initialSync.mockRejectedValueOnce(new Error("Telegram unavailable"));
    renderPanel();
    fireEvent.click(
      await screen.findByRole("button", { name: "Manage sources" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    expect(
      await screen.findByText(
        "Conversation sync failed. You can safely retry it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync" })).toBeEnabled();
  });
});
