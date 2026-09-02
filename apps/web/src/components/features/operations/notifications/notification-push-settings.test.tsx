import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { operationsNotificationsApi } from "@/lib/features/operations/operations-notifications-api";
import { NotificationPushSettings } from "./notification-push-settings";

const { getSubscription, subscribe, requestPermission } = vi.hoisted(() => ({
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
  requestPermission: vi.fn(),
}));

vi.mock("@/providers/notification-service-worker-provider", () => ({
  useNotificationServiceWorker: () => ({
    supported: true,
    registration: { pushManager: { getSubscription, subscribe } },
    registrationError: null,
  }),
}));

function browserSubscription() {
  return {
    endpoint: "https://push.example/device",
    toJSON: () => ({
      endpoint: "https://push.example/device",
      keys: { p256dh: "key", auth: "auth" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <NotificationPushSettings workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("NotificationPushSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getSubscription.mockReset().mockResolvedValue(null);
    subscribe.mockReset().mockResolvedValue(browserSubscription());
    requestPermission.mockReset().mockResolvedValue("granted");
    vi.stubGlobal("PushManager", class PushManagerMock {});
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission,
    });
    vi.spyOn(operationsNotificationsApi, "preferences").mockResolvedValue({
      webPushEnabled: false,
      pushConfigured: true,
      activeSubscriptionCount: 0,
    });
    vi.spyOn(operationsNotificationsApi, "pushConfig").mockResolvedValue({
      enabled: true,
      publicKey: "AQ",
    });
    vi.spyOn(
      operationsNotificationsApi,
      "addPushSubscription",
    ).mockResolvedValue({
      webPushEnabled: false,
      pushConfigured: true,
      activeSubscriptionCount: 1,
    });
    vi.spyOn(operationsNotificationsApi, "updatePreferences").mockResolvedValue(
      {
        webPushEnabled: true,
        pushConfigured: true,
        activeSubscriptionCount: 1,
      },
    );
    vi.spyOn(
      operationsNotificationsApi,
      "removePushSubscription",
    ).mockResolvedValue({
      webPushEnabled: true,
      pushConfigured: true,
      activeSubscriptionCount: 0,
    });
  });

  it("requests browser permission only after explicit Turn on", async () => {
    renderSettings();
    const turnOn = await screen.findByRole("button", { name: "Turn on" });
    expect(requestPermission).not.toHaveBeenCalled();
    await userEvent.click(turnOn);
    await waitFor(() => expect(requestPermission).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        operationsNotificationsApi.addPushSubscription,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: "https://push.example/device" }),
      ),
    );
    expect(operationsNotificationsApi.updatePreferences).toHaveBeenCalledWith(
      true,
    );
  });

  it("shows denied permission without attempting a subscription", async () => {
    vi.stubGlobal("Notification", {
      permission: "denied",
      requestPermission,
    });
    renderSettings();
    expect(
      await screen.findByText(/Browser permission is denied/u),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on" })).toBeDisabled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("surfaces a stale enabled preference as a reconnect action", async () => {
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission,
    });
    vi.mocked(operationsNotificationsApi.preferences).mockResolvedValue({
      webPushEnabled: true,
      pushConfigured: true,
      activeSubscriptionCount: 1,
    });
    renderSettings();
    expect(
      await screen.findByText(/this browser is not subscribed/u),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeEnabled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("re-registers an existing browser subscription without rewriting an enabled preference", async () => {
    const existing = browserSubscription();
    getSubscription.mockResolvedValue(existing);
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission,
    });
    vi.mocked(operationsNotificationsApi.preferences).mockResolvedValue({
      webPushEnabled: true,
      pushConfigured: true,
      activeSubscriptionCount: 0,
    });
    renderSettings();

    await userEvent.click(
      await screen.findByRole("button", { name: "Reconnect" }),
    );
    await waitFor(() =>
      expect(
        operationsNotificationsApi.addPushSubscription,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: existing.endpoint }),
      ),
    );
    expect(subscribe).not.toHaveBeenCalled();
    expect(operationsNotificationsApi.updatePreferences).not.toHaveBeenCalled();
  });

  it("turns off only the current workspace preference and keeps the User device registered", async () => {
    const existing = browserSubscription();
    getSubscription.mockResolvedValue(existing);
    vi.stubGlobal("Notification", {
      permission: "granted",
      requestPermission,
    });
    vi.mocked(operationsNotificationsApi.preferences).mockResolvedValue({
      webPushEnabled: true,
      pushConfigured: true,
      activeSubscriptionCount: 1,
    });
    vi.mocked(operationsNotificationsApi.updatePreferences).mockResolvedValue({
      webPushEnabled: false,
      pushConfigured: true,
      activeSubscriptionCount: 0,
    });
    renderSettings();

    await userEvent.click(
      await screen.findByRole("button", { name: "Turn off" }),
    );
    await waitFor(() =>
      expect(operationsNotificationsApi.updatePreferences).toHaveBeenCalledWith(
        false,
      ),
    );
    expect(
      operationsNotificationsApi.removePushSubscription,
    ).not.toHaveBeenCalled();
    expect(existing.unsubscribe).not.toHaveBeenCalled();
  });
});
