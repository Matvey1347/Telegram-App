import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountApi, telegramUserAccountsApi } from "@/lib/api";
import { AccountWorkspace } from "./account-workspace";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: () => <button type="button">Change avatar</button>,
}));
vi.mock("@/lib/api", () => ({
  accountApi: { me: vi.fn(), updateMe: vi.fn(), updatePassword: vi.fn() },
  telegramUserAccountsApi: { list: vi.fn() },
}));

const me = {
  id: "user-1",
  email: "alex@example.com",
  name: "Alex",
  createdAt: "2026-08-29",
  avatarIconId: null,
  avatarIcon: null,
  avatarPresentation: null,
  telegramUsername: null,
  assignedTelegramUserAccounts: [
    {
      id: "tg-1",
      label: "Primary",
      username: "alex",
      firstName: "Alex",
      lastName: "K",
      photoUrl: "/alex.jpg",
      status: "connected" as const,
    },
  ],
  workspace: { id: "workspace-1", name: "Business", role: "owner" as const },
};
const telegramAccount = {
  ...me.assignedTelegramUserAccounts[0],
  apiId: "123",
  isPremium: false,
  captionLengthMax: 1024,
  messageLengthMax: 4096,
  crmSyncEnabled: false,
  crmSendEnabled: false,
  mtprotoPublishingEnabled: true,
  isActive: true,
  assignedMember: null,
};

function renderAccount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AccountWorkspace />
    </QueryClientProvider>,
  );
}

describe("AccountWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(accountApi.me).mockResolvedValue(me);
    vi.mocked(telegramUserAccountsApi.list).mockResolvedValue([
      telegramAccount,
    ]);
    vi.mocked(accountApi.updateMe).mockResolvedValue(me);
    vi.mocked(accountApi.updatePassword).mockResolvedValue({ success: true });
  });

  it("shows profile and password as two separate tabs", async () => {
    renderAccount();
    expect(await screen.findByText("Telegram identity")).toBeInTheDocument();
    expect(screen.getAllByText("@alex")).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: "Change password" }));
    expect(
      document.querySelector('input[name="currentPassword"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText("Telegram identity")).not.toBeInTheDocument();
  });

  it("uses exactly one Telegram identity mode in the update payload", async () => {
    renderAccount();
    await screen.findByText("Telegram identity");
    fireEvent.click(screen.getByRole("button", { name: "Username" }));
    fireEvent.change(screen.getByPlaceholderText("@username"), {
      target: { value: "@new_name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(vi.mocked(accountApi.updateMe).mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          telegramUsername: "@new_name",
          telegramUserAccountIds: [],
        }),
      ),
    );
  });
});
