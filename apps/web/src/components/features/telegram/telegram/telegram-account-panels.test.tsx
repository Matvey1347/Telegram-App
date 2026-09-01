import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MtprotoAccountsPanel } from "./telegram-account-panels";

const { listAccounts, loginWithQr, startLogin, account } = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  loginWithQr: vi.fn(() => new Promise(() => undefined)),
  startLogin: vi.fn(),
  account: {
    id: "account-1",
    label: "Owner account",
    apiId: "12345",
    isPremium: false,
    captionLengthMax: 1024,
    messageLengthMax: 4096,
    status: "error" as const,
    lastErrorMessage:
      "The connected Telegram account session is no longer valid. Reconnect the account and retry.",
    isActive: true,
  },
}));

vi.mock("@/lib/api", () => ({
  authApi: {
    me: vi.fn().mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com", name: "Owner" },
      workspace: {
        id: "workspace-1",
        name: "Workspace",
        role: "OWNER",
        access: {
          roleId: null,
          roleVersion: 1,
          isOwner: true,
          permissionKeys: [],
          featureIds: ["adSales.crm"],
        },
      },
    }),
  },
  telegramUserAccountsApi: {
    list: listAccounts,
    channels: vi.fn().mockResolvedValue([]),
    loginWithQr,
    create: vi.fn(),
    remove: vi.fn(),
    startLogin,
    confirmCode: vi.fn(),
    confirmPassword: vi.fn(),
    check: vi.fn(),
    syncDialogsWithProgress: vi.fn(),
    importChannelsWithProgress: vi.fn(),
  },
  telegramBotsApi: {},
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({
    pushToast: vi.fn(),
    setProgress: vi.fn(),
    clearProgress: vi.fn(),
  }),
}));

describe("MtprotoAccountsPanel QR recovery", () => {
  beforeEach(() => {
    window.localStorage.setItem("selected-workspace-id", "workspace-1");
    loginWithQr.mockReset();
    loginWithQr.mockImplementation(() => new Promise(() => undefined));
    startLogin.mockReset();
    listAccounts.mockReset();
    listAccounts.mockResolvedValue([account]);
  });

  it("offers QR login while the account is waiting for a phone code", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    listAccounts.mockResolvedValue([
      { ...account, status: "needs_code", lastErrorMessage: undefined },
    ]);

    render(
      <QueryClientProvider client={client}>
        <MtprotoAccountsPanel createOpen={false} onCreateClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Actions for Owner account" }),
    ).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("button", { name: "Login via QR" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Link Telegram: Owner account" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(loginWithQr).toHaveBeenCalledTimes(1));
    expect(startLogin).not.toHaveBeenCalled();
  });

  it("opens QR recovery for a revoked account without starting phone login", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MtprotoAccountsPanel createOpen={false} onCreateClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Refresh via QR" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Link Telegram: Owner account" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(loginWithQr).toHaveBeenCalledWith(
        "account-1",
        expect.any(Function),
        expect.any(AbortSignal),
      ),
    );
    expect(startLogin).not.toHaveBeenCalled();
  });

  it("closes QR recovery before opening the existing 2FA modal", async () => {
    loginWithQr.mockResolvedValueOnce({
      success: true,
      status: "needs_password",
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MtprotoAccountsPanel createOpen={false} onCreateClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Refresh via QR" }),
    );

    expect(
      await screen.findByRole("dialog", {
        name: "2FA password: Owner account",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Link Telegram: Owner account" }),
    ).not.toBeInTheDocument();
  });

  it("aborts QR recovery when the active workspace changes", async () => {
    let signal: AbortSignal | undefined;
    loginWithQr.mockImplementation((...args: unknown[]) => {
      const requestSignal = args[2] as AbortSignal;
      signal = requestSignal;
      return new Promise(() => undefined);
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MtprotoAccountsPanel createOpen={false} onCreateClose={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Refresh via QR" }),
    );
    await waitFor(() => expect(loginWithQr).toHaveBeenCalledTimes(1));

    window.localStorage.setItem("selected-workspace-id", "workspace-2");
    client.setQueryData(["workspace-switch"], true);

    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(
      screen.queryByRole("dialog", { name: "Link Telegram: Owner account" }),
    ).not.toBeInTheDocument();
  });
});
