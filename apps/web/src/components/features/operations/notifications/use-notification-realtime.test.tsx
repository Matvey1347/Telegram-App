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
