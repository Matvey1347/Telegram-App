import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { operationsNotificationsApi } from "@/lib/features/operations/operations-notifications-api";
import { NotificationPushSettings } from "./notification-push-settings";
import type { OperationsNotificationPreferences } from "@telegram-system/shared";
import { operationsNotificationKeys } from "@/lib/query-keys";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { I18nProvider } from "@/providers/i18n-provider";

const { getSubscription, subscribe, requestPermission, browserState } = vi.hoisted(() => {
  const getSubscription = vi.fn();
  const subscribe = vi.fn();
  return { getSubscription, subscribe, requestPermission: vi.fn(), browserState: {
    supported: true, registration: { pushManager: { getSubscription, subscribe } }, registrationError: null as string | null,
  } };
});

vi.mock("@/providers/notification-service-worker-provider", () => ({
  useNotificationServiceWorker: () => browserState,
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

function renderSettings(locale: "en" | "ru" = "en") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const tree = (workspaceId: string) => (
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale={locale}><NotificationPushSettings workspaceId={workspaceId} /></I18nProvider>
    </QueryClientProvider>
  );
  const view = render(tree("workspace-1"));
  return { ...view, client, changeWorkspace: (id: string) => view.rerender(tree(id)) };
}

describe("NotificationPushSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    browserState.supported = true;
    browserState.registrationError = null;
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
    vi.spyOn(operationsNotificationsApi, "testPush").mockResolvedValue({ status: "sent", attempted: 2, delivered: 2, failed: 0, skipped: 0 });
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

  it("does not register a device when the explicit browser permission request is denied", async () => {
    requestPermission.mockResolvedValue("denied");
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    expect(await screen.findByText(/Browser permission is denied/)).toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();
    expect(operationsNotificationsApi.addPushSubscription).not.toHaveBeenCalled();
  });

  it("stops old-workspace setup if the workspace changes while permission is pending", async () => {
    let resolve!: (value: NotificationPermission) => void;
    requestPermission.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(requestPermission).toHaveBeenCalledOnce());
    view.changeWorkspace("workspace-2");
    await screen.findByRole("button", { name: "Turn on" });
    await act(async () => resolve("granted"));
    expect(subscribe).not.toHaveBeenCalled();
    expect(operationsNotificationsApi.addPushSubscription).not.toHaveBeenCalled();
    expect(operationsNotificationsApi.updatePreferences).not.toHaveBeenCalled();
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

  it("keeps legacy browser opt-in separate from new incoming CRM opt-in and defaults to private previews", async () => {
    vi.mocked(operationsNotificationsApi.preferences).mockResolvedValue({ webPushEnabled: true, pushConfigured: true, activeSubscriptionCount: 2 });
    renderSettings();
    expect(await screen.findByRole("button", { name: "New incoming messages" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Show message preview" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Follow-up reminders" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "AI Leads" })).toBeDisabled();
    expect(operationsNotificationsApi.updatePreferences).not.toHaveBeenCalled();
    expect(operationsNotificationsApi.testPush).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("patches explicit CRM consent into only its scoped cache using the authoritative response", async () => {
    const authoritative = { webPushEnabled: false, pushConfigured: true, activeSubscriptionCount: 3, crmIncomingMessagesEnabled: true };
    vi.mocked(operationsNotificationsApi.updatePreferences).mockResolvedValue(authoritative);
    const { client } = renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "New incoming messages" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "New incoming messages" })).toHaveAttribute("aria-pressed", "true"));
    expect(operationsNotificationsApi.updatePreferences).toHaveBeenCalledWith({ crmIncomingMessagesEnabled: true });
    expect(client.getQueryData(operationsNotificationKeys.preferences("workspace-1"))).toEqual(authoritative);
    expect(operationsNotificationsApi.preferences).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(operationsNotificationsApi.testPush).not.toHaveBeenCalled();
  });

  it("drops cached previews and refreshes only scoped Operations list/badge after a privacy change", async () => {
    vi.mocked(operationsNotificationsApi.preferences).mockResolvedValue({ webPushEnabled: true, pushConfigured: true, activeSubscriptionCount: 1, crmMessagePreviewEnabled: true });
    vi.mocked(operationsNotificationsApi.updatePreferences).mockResolvedValue({ webPushEnabled: true, pushConfigured: true, activeSubscriptionCount: 1, crmMessagePreviewEnabled: false });
    const { client } = renderSettings();
    const inboxKey = telegramCrmKeys.inboxConversationsList({ filter: "ALL", limit: 50 });
    client.setQueryData(inboxKey, { untouched: true });
    client.setQueryData(operationsNotificationKeys.list("workspace-1"), { pages: [{ items: [{ id: "private-preview", body: "Private cached customer text" }], nextCursor: "older" }], pageParams: [null] });
    client.setQueryData(operationsNotificationKeys.unread("workspace-1"), { unread: 3 });
    client.setQueryData(operationsNotificationKeys.list("workspace-2"), { untouched: true });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const cancel = vi.spyOn(client, "cancelQueries");
    await userEvent.click(await screen.findByRole("button", { name: "Show message preview" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(cancel).toHaveBeenCalledWith({ queryKey: operationsNotificationKeys.list("workspace-1"), exact: true });
    expect(invalidate.mock.calls.map(([filters]) => filters)).toEqual([
      { queryKey: operationsNotificationKeys.list("workspace-1"), exact: true },
      { queryKey: operationsNotificationKeys.unread("workspace-1"), exact: true },
    ]);
    expect(JSON.stringify(client.getQueryData(operationsNotificationKeys.list("workspace-1")))).not.toContain("Private cached customer text");
    expect(client.getQueryData(operationsNotificationKeys.list("workspace-1"))).toMatchObject({ pages: [], pageParams: [] });
    expect(client.getQueryData(inboxKey)).toEqual({ untouched: true });
    expect(client.getQueryState(inboxKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(operationsNotificationKeys.list("workspace-2"))).toEqual({ untouched: true });
  });

  it("disables dependent CRM controls when the master preference is off", async () => {
    vi.mocked(operationsNotificationsApi.updatePreferences).mockResolvedValue({ webPushEnabled: false, pushConfigured: true, activeSubscriptionCount: 0, crmNotificationsEnabled: false });
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "CRM Notifications" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "New incoming messages" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Follow-up reminders" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show message preview" })).toBeDisabled();
    expect(operationsNotificationsApi.updatePreferences).toHaveBeenCalledWith({ crmNotificationsEnabled: false });
  });

  it("shows preference write failure without pretending consent was saved", async () => {
    vi.mocked(operationsNotificationsApi.updatePreferences).mockRejectedValue(new Error("Network unavailable"));
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "New incoming messages" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("preferences could not be saved");
    expect(screen.getByRole("button", { name: "New incoming messages" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a pending old-workspace preference response out of the newly selected workspace", async () => {
    let resolve!: (value: OperationsNotificationPreferences) => void;
    vi.mocked(operationsNotificationsApi.updatePreferences).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "New incoming messages" }));
    await waitFor(() => expect(operationsNotificationsApi.updatePreferences).toHaveBeenCalledOnce());
    view.changeWorkspace("workspace-2");
    expect(await screen.findByRole("button", { name: "New incoming messages" })).toHaveAttribute("aria-pressed", "false");
    await act(async () => resolve({ webPushEnabled: false, pushConfigured: true, activeSubscriptionCount: 1, crmIncomingMessagesEnabled: true }));
    expect(screen.getByRole("button", { name: "New incoming messages" })).toHaveAttribute("aria-pressed", "false");
    expect(view.client.getQueryData(operationsNotificationKeys.preferences("workspace-2"))).toMatchObject({ webPushEnabled: false });
    expect(view.client.getQueryData(operationsNotificationKeys.preferences("workspace-2"))).not.toHaveProperty("crmIncomingMessagesEnabled", true);
  });

  it("sends a test to the user's subscribed devices only after an explicit click", async () => {
    vi.mocked(operationsNotificationsApi.preferences).mockResolvedValue({ webPushEnabled: true, pushConfigured: true, activeSubscriptionCount: 2 });
    const { client } = renderSettings();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const test = await screen.findByRole("button", { name: "Send test to my subscribed devices" });
    expect(operationsNotificationsApi.testPush).not.toHaveBeenCalled();
    await userEvent.click(test);
    expect(await screen.findByRole("status")).toHaveTextContent("Push service accepted the test for 2 device(s).");
    expect(operationsNotificationsApi.testPush).toHaveBeenCalledOnce();
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      operationsNotificationKeys.list("workspace-1"), operationsNotificationKeys.unread("workspace-1"),
    ]);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each([
    ["no_subscription", "No active device subscription"],
    ["rate_limited", "wait one minute"],
    ["failed", "could not reach your devices"],
    ["unavailable", "temporarily unavailable"],
    ["disabled", "turned off for this workspace"],
  ] as const)("explains a %s test result", async (status, text) => {
    vi.mocked(operationsNotificationsApi.preferences).mockResolvedValue({ webPushEnabled: true, pushConfigured: true, activeSubscriptionCount: 0 });
    vi.mocked(operationsNotificationsApi.testPush).mockResolvedValue({ status, attempted: 0, delivered: 0, failed: 0, skipped: 0 });
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Send test to my subscribed devices" }));
    expect(await screen.findByRole("status")).toHaveTextContent(text);
  });

  it("keeps CRM in-app preferences usable when browser push is unsupported", async () => {
    browserState.supported = false;
    renderSettings();
    expect(await screen.findByText("Web Push is unsupported in this browser.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New incoming messages" })).toBeEnabled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("rolls back a newly created browser subscription if registering it fails", async () => {
    const created = browserSubscription();
    subscribe.mockResolvedValue(created);
    vi.mocked(operationsNotificationsApi.addPushSubscription).mockRejectedValue(new Error("API unavailable"));
    renderSettings();
    await userEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Push setup failed");
    expect(created.unsubscribe).toHaveBeenCalledOnce();
    expect(operationsNotificationsApi.updatePreferences).not.toHaveBeenCalled();
  });

  it("localizes CRM notification consent controls in Russian", async () => {
    renderSettings("ru");
    expect(await screen.findByRole("button", { name: "Новые входящие сообщения" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Показывать текст сообщения" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/Это отдельное согласие/)).toBeInTheDocument();
  });
});
