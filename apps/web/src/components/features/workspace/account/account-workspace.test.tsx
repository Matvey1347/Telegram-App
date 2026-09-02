import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountApi, telegramUserAccountsApi } from "@/lib/api";
import { AccountWorkspace } from "./account-workspace";
import { I18nProvider } from "@/providers/i18n-provider";
import accountEn from "@/i18n/locales/en/account";
import accountRu from "@/i18n/locales/ru/account";

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

function renderAccount(locale: "en" | "ru" = "en") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <I18nProvider
        initialLocale={locale}
        preloadedCatalogs={{ account: locale === "ru" ? accountRu : accountEn }}
      >
        <AccountWorkspace />
      </I18nProvider>
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

  it("renders the complete profile workflow in Russian", async () => {
    renderAccount("ru");

    expect(await screen.findByText("Мой профиль")).toBeInTheDocument();
    expect(await screen.findByText("Telegram-профиль")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Сохранить изменения" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Изменить пароль" }));
    expect(screen.getByText("Текущий пароль")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Обновить пароль" }),
    ).toBeInTheDocument();
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

  it("shows a recoverable Russian error when the profile cannot load", async () => {
    vi.mocked(accountApi.me).mockRejectedValue(
      new Error("database unavailable"),
    );
    renderAccount("ru");

    expect(
      await screen.findByText("Не удалось загрузить профиль."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(accountApi.me).toHaveBeenCalledTimes(2));
  });
});
