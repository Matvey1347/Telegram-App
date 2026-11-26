import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicationNotificationsApi } from "@/lib/features/operations/publication-notifications-api";
import { PublicationNotificationSettings } from "./publication-notification-settings";

vi.mock("@/lib/features/operations/publication-notifications-api", () => ({
  publicationNotificationsApi: {
    settings: vi.fn(),
    save: vi.fn(),
    preview: vi.fn(),
  },
}));

const defaults = {
  coverageDestination: "TELEGRAM_GROUP",
  autopilotDestination: "TELEGRAM_GROUP",
  autopilotErrorDestination: "TELEGRAM_GROUP",
  scheduledConfirmationDestination: "TELEGRAM_PRIVATE",
  publishedConfirmationDestination: "TELEGRAM_PRIVATE",
} as const;

const channels = [
  { id: "first", title: "Editorial", iconPresentation: null },
  { id: "second", title: "Postcards", iconPresentation: null },
];

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PublicationNotificationSettings workspaceId="workspace" />
    </QueryClientProvider>,
  );
}

describe("publication notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(publicationNotificationsApi.settings).mockResolvedValue({
      ...defaults,
      enabled: false,
      excludedChannelIds: [],
      channels,
    });
  });

  it("includes every channel by default and saves an exclusion for the workspace", async () => {
    vi.mocked(publicationNotificationsApi.save).mockResolvedValue({
      ...defaults,
      autopilotDestination: "IN_APP",
      enabled: true,
      excludedChannelIds: ["second"],
      channels,
    });
    renderSettings();
    fireEvent.click(await screen.findByText("Все активные каналы"));
    expect(screen.getByLabelText("Editorial")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Postcards"));
    fireEvent.click(
      screen.getByRole("button", { name: "Уведомлять о запасе публикаций" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Отчёт автопилота AI Posting" }),
    );
    const option = await screen.findByRole("button", { name: "В приложении" });
    expect(option.querySelector("svg")).not.toBeNull();
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(publicationNotificationsApi.save).toHaveBeenCalledWith(
        {
          ...defaults,
          autopilotDestination: "IN_APP",
          enabled: true,
          excludedChannelIds: ["second"],
        },
        expect.anything(),
      ),
    );
    expect(await screen.findByText("Исключено каналов: 1")).toBeInTheDocument();
  });

  it("can preview a sample when settings are unavailable", async () => {
    vi.mocked(publicationNotificationsApi.settings).mockRejectedValue(
      new Error("Unavailable"),
    );
    vi.mocked(publicationNotificationsApi.preview).mockResolvedValue({
      coverage: [{ text: "Образец" }],
      autopilot: [],
      autopilotError: [],
      scheduledConfirmation: [],
      publishedConfirmation: [],
    });
    renderSettings();
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Предпросмотр сообщений" }),
    );
    expect(await screen.findByText("Образец")).toBeVisible();
    expect(publicationNotificationsApi.preview).toHaveBeenCalledWith(
      "",
      expect.any(AbortSignal),
    );
  });

  it("loads the five previews only when requested", async () => {
    vi.mocked(publicationNotificationsApi.preview).mockResolvedValue({
      coverage: [{ text: "Запас публикаций · 3 дн." }],
      autopilot: [{ text: "Черновики · +30" }],
      autopilotError: [{ text: "Ошибки · 6" }],
      scheduledConfirmation: [{ text: "Пост заплановано" }],
      publishedConfirmation: [{ text: "Пости опубліковано" }],
    });
    renderSettings();
    await screen.findByText("Все активные каналы");
    for (const group of ["Подтверждения публикаций", "AI Posting", "Запас публикаций"]) {
      expect(screen.getByRole("region", { name: group })).toBeVisible();
    }
    expect(publicationNotificationsApi.preview).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Предпросмотр сообщений" }),
    );
    expect(await screen.findByText("Черновики · +30")).toBeInTheDocument();
    expect(screen.getByText("Ошибки · 6")).toBeInTheDocument();
    expect(screen.getByText("Запас публикаций · 3 дн.")).toBeInTheDocument();
    expect(screen.getByText("Пост заплановано")).toBeInTheDocument();
    expect(screen.getByText("Пости опубліковано")).toBeInTheDocument();
    expect(publicationNotificationsApi.save).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Канал для предпросмотра" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Postcards" }));
    await waitFor(() =>
      expect(publicationNotificationsApi.preview).toHaveBeenLastCalledWith(
        "second",
        expect.any(AbortSignal),
      ),
    );
  });
});
