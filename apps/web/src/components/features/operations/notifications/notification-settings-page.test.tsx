import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi, telegramSystemBotApi } from "@/lib/api";
import { NotificationSettingsPage } from "./notification-settings-page";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/api", () => ({
  authApi: { me: vi.fn() },
  telegramSystemBotApi: {
    notificationGroup: vi.fn(),
    createNotificationGroupLink: vi.fn(),
    disconnectNotificationGroup: vi.fn(),
    notificationAccount: vi.fn(),
    createNotificationAccountLink: vi.fn(),
    disconnectNotificationAccount: vi.fn(),
  },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationSettingsPage />
    </QueryClientProvider>,
  );
}

describe("NotificationSettingsPage", () => {
  beforeEach(() => {
    vi.mocked(authApi.me).mockResolvedValue({
      workspace: {
        id: "workspace-1",
        name: "Business",
        role: "owner",
      },
    } as Awaited<ReturnType<typeof authApi.me>>);
  });

  it("shows the selected personal account separately from the notification group", async () => {
    vi.mocked(telegramSystemBotApi.notificationGroup).mockResolvedValue({
      connected: true,
      chatTitle: "Operations alerts",
      botUsername: "nexeloq_bot",
    });
    vi.mocked(telegramSystemBotApi.notificationAccount).mockResolvedValue({
      connected: true,
      telegramUsername: "primary_admin",
      displayName: "@primary_admin",
      telegramUserId: "12345",
      botUsername: "nexeloq_bot",
    });

    renderPage();

    expect(
      await screen.findByRole("link", { name: "@nexeloq_bot" }),
    ).toHaveAttribute("href", "https://t.me/nexeloq_bot");
    expect(screen.getByText("@primary_admin")).toBeInTheDocument();
    expect(screen.getByText("Operations alerts")).toBeInTheDocument();
    expect(
      screen.getByText(/Сообщения от бота будут приходить на этот аккаунт/),
    ).toBeInTheDocument();
  });

  it("generates a private account link from its own action menu", async () => {
    vi.mocked(telegramSystemBotApi.notificationGroup).mockResolvedValue({
      connected: false,
      chatTitle: null,
      botUsername: "nexeloq_bot",
    });
    vi.mocked(telegramSystemBotApi.notificationAccount).mockResolvedValue({
      connected: false,
      telegramUsername: null,
      displayName: null,
      telegramUserId: null,
      botUsername: "nexeloq_bot",
    });
    vi.mocked(
      telegramSystemBotApi.createNotificationAccountLink,
    ).mockResolvedValue({
      token: "one-time-token",
      botUsername: "nexeloq_bot",
      expiresAt: "2026-11-12T12:00:00.000Z",
    });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Действия с аккаунтом уведомлений",
      }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Подключить аккаунт" }),
    );

    expect(
      await screen.findByRole("link", { name: /Открыть dev бот/ }),
    ).toHaveAttribute(
      "href",
      "https://t.me/nexeloq_bot?start=workspace_notify_one-time-token",
    );
    expect(
      telegramSystemBotApi.createNotificationGroupLink,
    ).not.toHaveBeenCalled();
  });

  it("shows independent retry errors for the account and group", async () => {
    vi.mocked(telegramSystemBotApi.notificationGroup).mockRejectedValue(
      new Error("unavailable"),
    );
    vi.mocked(telegramSystemBotApi.notificationAccount).mockRejectedValue(
      new Error("unavailable"),
    );

    renderPage();

    expect(
      await screen.findByText(/Не удалось загрузить аккаунт уведомлений/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Не удалось загрузить группу/)).toBeInTheDocument();
  });
});
