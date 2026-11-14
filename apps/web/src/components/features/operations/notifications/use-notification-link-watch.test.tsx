import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { telegramSystemBotApi } from "@/lib/api";
import { useNotificationLinkWatch } from "./use-notification-link-watch";

vi.mock("@/lib/api", () => ({ telegramSystemBotApi: { notificationGroup: vi.fn(), notificationAccount: vi.fn() } }));
describe("notification connection watch", () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
  it("refreshes an active link and stops when Telegram confirms it", async () => {
    vi.useFakeTimers();
    vi.mocked(telegramSystemBotApi.notificationGroup).mockResolvedValue({ connected: true, linkPending: false, chatTitle: "Team", botUsername: "bot" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useNotificationLinkWatch("workspace", "group", { token: "token", expiresAt: new Date(Date.now() + 60_000).toISOString() }), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(telegramSystemBotApi.notificationGroup).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(telegramSystemBotApi.notificationGroup).toHaveBeenCalledTimes(1);
  });
  it("does not poll without an active linking request", async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    renderHook(() => useNotificationLinkWatch("workspace", "group", null), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(telegramSystemBotApi.notificationGroup).not.toHaveBeenCalled();
  });
  it("retries a temporary failure and updates after the link completes", async () => {
    vi.useFakeTimers();
    vi.mocked(telegramSystemBotApi.notificationAccount).mockRejectedValueOnce(new Error("temporary")).mockResolvedValue({ connected: true, linkPending: false, telegramUsername: "person", displayName: "@person", botUsername: "bot" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const link = { token: "token", expiresAt: new Date(Date.now() + 60_000).toISOString() };
    renderHook(() => useNotificationLinkWatch("workspace", "account", link), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
    expect(telegramSystemBotApi.notificationAccount).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(["telegram-system-bot", "notification-account", "workspace"])).toMatchObject({ connected: true });
  });
});
