import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TelegramManagedPost } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { useManagedPostDueRefresh } from "./use-managed-post-due-refresh";

describe("useManagedPostDueRefresh", () => {
  afterEach(() => vi.useRealTimers());

  it("refetches at the due instant and stops when publication fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T20:21:59.000Z"));
    const queryClient = new QueryClient();
    const scheduled = {
      id: "post",
      status: "SCHEDULED",
      scheduleMode: "LOCAL",
      scheduledAt: "2026-08-24T20:22:00.000Z",
    } as TelegramManagedPost;
    queryClient.setQueryData(telegramPostKeys.managed("channel"), [scheduled]);
    const refetch = vi
      .spyOn(queryClient, "refetchQueries")
      .mockImplementation(async () => {
        queryClient.setQueryData(telegramPostKeys.managed("channel"), [
          { ...scheduled, status: "FAILED", lastError: "bot unavailable" },
        ]);
        return undefined;
      });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(
      () => useManagedPostDueRefresh({ channelId: "channel", post: scheduled }),
      { wrapper },
    );
    const managedRefetchCount = () =>
      refetch.mock.calls.filter(
        ([filters]) =>
          JSON.stringify(filters?.queryKey) ===
          JSON.stringify(telegramPostKeys.managed("channel")),
      ).length;
    await act(() => vi.advanceTimersByTimeAsync(999));
    expect(managedRefetchCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(managedRefetchCount()).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(managedRefetchCount()).toBe(1);
  });

  it("does no recurring work for a native Telegram schedule", () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, "refetchQueries");
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(
      () =>
        useManagedPostDueRefresh({
          channelId: "channel",
          post: {
            id: "post",
            status: "SCHEDULED",
            scheduleMode: "TELEGRAM_NATIVE",
            scheduledAt: new Date(Date.now() + 1_000).toISOString(),
          } as TelegramManagedPost,
        }),
      { wrapper },
    );
    vi.runAllTimers();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("keeps refreshing through the transient publishing state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T20:22:00.000Z"));
    const queryClient = new QueryClient();
    const publishing = {
      id: "post",
      status: "PUBLISHING",
      scheduleMode: "LOCAL",
      scheduledAt: "2026-08-24T20:22:00.000Z",
    } as TelegramManagedPost;
    queryClient.setQueryData(telegramPostKeys.managed("channel"), [publishing]);
    const refetch = vi
      .spyOn(queryClient, "refetchQueries")
      .mockImplementation(async () => {
        queryClient.setQueryData(telegramPostKeys.managed("channel"), [
          { ...publishing, status: "PUBLISHED", scheduleMode: null },
        ]);
        return undefined;
      });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(
      () => useManagedPostDueRefresh({ channelId: "channel", post: publishing }),
      { wrapper },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(
      refetch.mock.calls.filter(
        ([filters]) =>
          JSON.stringify(filters?.queryKey) ===
          JSON.stringify(telegramPostKeys.managed("channel")),
      ),
    ).toHaveLength(1);
  });
});
