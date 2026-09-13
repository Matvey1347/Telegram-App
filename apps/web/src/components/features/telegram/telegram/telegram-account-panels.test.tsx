import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MtprotoAccountsPanel } from "./telegram-account-panels";

const {
  listAccounts,
  loginWithQr,
  startLogin,
  syncDialogsWithProgress,
  importChannelsWithProgress,
  setProgress,
  account,
} = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  loginWithQr: vi.fn(() => new Promise(() => undefined)),
  startLogin: vi.fn(),
  syncDialogsWithProgress: vi.fn(),
  importChannelsWithProgress: vi.fn(),
  setProgress: vi.fn(),
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
    syncDialogsWithProgress,
    importChannelsWithProgress,
  },
  telegramBotsApi: {},
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({
    pushToast: vi.fn(),
    setProgress,
    clearProgress: vi.fn(),
  }),
}));

describe("MtprotoAccountsPanel QR recovery", () => {
  beforeEach(() => {
    window.localStorage.setItem("selected-workspace-id", "workspace-1");
    loginWithQr.mockReset();
    loginWithQr.mockImplementation(() => new Promise(() => undefined));
    startLogin.mockReset();
    syncDialogsWithProgress.mockReset();
    importChannelsWithProgress.mockReset();
    setProgress.mockReset();
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

  it("shows the MTProto identity and avatars for synchronized and new channels", async () => {
    listAccounts.mockResolvedValue([
      {
        ...account,
        status: "connected",
        username: "owner",
        photoUrl: "https://cdn.test/owner.jpg",
        lastErrorMessage: undefined,
      },
    ]);
    syncDialogsWithProgress.mockResolvedValue({
      success: true,
      syncedChannels: [
        {
          channelId: "channel-1",
          workspaceChannelId: "workspace-channel-1",
          telegramChannelId: "-1001",
          title: "Existing channel",
          username: "existing_channel",
          photoUrl: "https://cdn.test/existing.jpg",
          role: "OWNER",
          permissions: {},
          canBeUsedForAnalytics: true,
        },
      ],
      availableChannels: [
        {
          channelId: "channel-2",
          telegramChannelId: "-1002",
          title: "New channel",
          username: null,
          photoUrl: null,
          role: "ADMIN",
          permissions: {},
          canBeUsedForAnalytics: true,
        },
      ],
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
      await screen.findByRole("button", { name: "Actions for @owner" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Sync channels" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Sync channels: @owner",
    });
    expect(
      dialog.querySelector('img[src="https://cdn.test/owner.jpg"]'),
    ).toBeInTheDocument();
    expect(
      dialog.querySelector('img[src="https://cdn.test/existing.jpg"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("New channel")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("CH");
  });

  it("renders detailed backend progress while importing channel data", async () => {
    listAccounts.mockResolvedValue([
      {
        ...account,
        status: "connected",
        username: "owner",
        lastErrorMessage: undefined,
      },
    ]);
    syncDialogsWithProgress.mockResolvedValue({
      success: true,
      syncedChannels: [],
      availableChannels: [
        {
          channelId: "channel-2",
          telegramChannelId: "-1002",
          title: "New channel",
          username: null,
          photoUrl: null,
          role: "ADMIN",
          permissions: {},
          canBeUsedForAnalytics: true,
        },
      ],
    });
    importChannelsWithProgress.mockImplementation(
      async (_accountId, _channels, onProgress) => {
        onProgress(
          {
            phase: "sync_step",
            message: "New channel: Importing historical posts",
          },
          35,
          100,
        );
        onProgress(
          {
            phase: "loading_invite_links",
            message: "New channel: Loading invite links 2/5",
            stageCurrent: 2,
            stageTotal: 5,
          },
          45,
          100,
        );
        return { success: true, channels: [] };
      },
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MtprotoAccountsPanel createOpen={false} onCreateClose={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Actions for @owner" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Sync channels" }));
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Add 1" }));

    await waitFor(() =>
      expect(setProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "New channel: Importing historical posts",
          current: 35,
          total: 100,
        }),
      ),
    );
    expect(setProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "New channel: Loading invite links 2/5",
        current: 2,
        total: 5,
      }),
    );
  });
});
