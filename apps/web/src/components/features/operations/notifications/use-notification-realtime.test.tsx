import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOperationsNotificationStream } from "@/lib/features/operations/operations-notifications-api";
import { useNotificationRealtime } from "./use-notification-realtime";

vi.mock("@/lib/features/operations/operations-notifications-api", () => ({
  fetchOperationsNotificationStream: vi.fn(),
}));

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function pendingStream({
  signal,
  onOpen,
}: {
  signal: AbortSignal;
  onOpen?: () => void;
}) {
  onOpen?.();
  return new Promise<void>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), {
      once: true,
    });
  });
}

describe("useNotificationRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisibility("visible");
    vi.mocked(fetchOperationsNotificationStream).mockImplementation(
      pendingStream as typeof fetchOperationsNotificationStream,
    );
  });

  afterEach(() => setVisibility("visible"));

  it("releases a hidden tab stream and reconciles after becoming visible", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    renderHook(
      () =>
        useNotificationRealtime({
          workspaceId: "workspace-1",
          enabled: true,
          panelOpen: false,
        }),
      { wrapper },
    );

    await waitFor(() =>
      expect(fetchOperationsNotificationStream).toHaveBeenCalledTimes(1),
    );
    const firstSignal = vi.mocked(fetchOperationsNotificationStream).mock
      .calls[0][0].signal;

    act(() => setVisibility("hidden"));
    expect(firstSignal.aborted).toBe(true);

    act(() => setVisibility("visible"));
    await waitFor(() =>
      expect(fetchOperationsNotificationStream).toHaveBeenCalledTimes(2),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["operations-notifications", "workspace-1", "unread"],
      exact: true,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["operations-notifications", "workspace-1", "list"],
      exact: true,
    });
  });

  it("does not open a stream while the tab starts hidden", async () => {
    setVisibility("hidden");
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    renderHook(
      () =>
        useNotificationRealtime({
          workspaceId: "workspace-1",
          enabled: true,
          panelOpen: false,
        }),
      { wrapper },
    );

    await act(() => Promise.resolve());
    expect(fetchOperationsNotificationStream).not.toHaveBeenCalled();
  });

  it("reconciles when the initial handshake was aborted while hiding", async () => {
    vi.mocked(fetchOperationsNotificationStream)
      .mockImplementationOnce(
        ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            );
          }),
      )
      .mockImplementation(
        pendingStream as typeof fetchOperationsNotificationStream,
      );
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(
      () =>
        useNotificationRealtime({
          workspaceId: "workspace-1",
          enabled: true,
          panelOpen: false,
        }),
      { wrapper },
    );

    await waitFor(() =>
      expect(fetchOperationsNotificationStream).toHaveBeenCalledTimes(1),
    );
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));

    await waitFor(() =>
      expect(fetchOperationsNotificationStream).toHaveBeenCalledTimes(2),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["operations-notifications", "workspace-1", "unread"],
      exact: true,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["operations-notifications", "workspace-1", "list"],
      exact: true,
    });
  });
});

describe("notification bursts and bounded reconnect", () => {
  beforeEach(() => { vi.clearAllMocks(); setVisibility("visible"); });
  afterEach(() => { vi.useRealTimers(); setVisibility("visible"); });
  it("coalesces 100 unknown group events into one small badge refresh without refetching Inbox", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchOperationsNotificationStream).mockImplementation(pendingStream as typeof fetchOperationsNotificationStream);
    const client = new QueryClient(); const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useNotificationRealtime({ workspaceId: "workspace-a", enabled: true, panelOpen: false }), { wrapper });
    const onEvent = vi.mocked(fetchOperationsNotificationStream).mock.calls[0][0].onEvent;
    await act(async () => {
      for (let i = 0; i < 100; i += 1) onEvent({ type: "notification.created", workspaceId: "workspace-a", recipientMemberId: "member-a", occurredAt: "now",
        notification: { id: `group-${i}`, workspaceId: "workspace-a", readAt: null } as never });
      await Promise.resolve();
    });
    expect(invalidate).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["operations-notifications", "workspace-a", "unread"], exact: true });
    hook.unmount();
  });
  it("ignores foreign workspace events and aborts the old stream on workspace switch", async () => {
    vi.mocked(fetchOperationsNotificationStream).mockImplementation(pendingStream as typeof fetchOperationsNotificationStream);
    const client = new QueryClient(); const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(({ workspaceId }) => useNotificationRealtime({ workspaceId, enabled: true, panelOpen: false }), { wrapper, initialProps: { workspaceId: "workspace-a" } });
    const first = vi.mocked(fetchOperationsNotificationStream).mock.calls[0][0];
    act(() => first.onEvent({ type: "notifications.invalidated", workspaceId: "foreign", recipientMemberId: "member-x", occurredAt: "now" }));
    expect(invalidate).not.toHaveBeenCalled();
    hook.rerender({ workspaceId: "workspace-b" }); expect(first.signal.aborted).toBe(true);
  });
  it("stops repeated immediately closed handshakes after six reconnect attempts", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchOperationsNotificationStream).mockImplementation(async ({ onOpen }) => { onOpen?.(); });
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useNotificationRealtime({ workspaceId: "workspace-a", enabled: true, panelOpen: false }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(fetchOperationsNotificationStream).toHaveBeenCalledTimes(7);
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(fetchOperationsNotificationStream).toHaveBeenCalledTimes(7);
    hook.unmount();
  });
});
