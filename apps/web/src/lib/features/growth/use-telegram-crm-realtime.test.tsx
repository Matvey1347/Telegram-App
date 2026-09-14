import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCrmEventStream } from "./telegram-crm-api";
import { useTelegramCrmRealtime } from "./use-telegram-crm-realtime";

vi.mock("./telegram-crm-api", () => ({ fetchCrmEventStream: vi.fn() }));

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useTelegramCrmRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVisibility("visible");
    vi.mocked(fetchCrmEventStream).mockImplementation(({ signal, onOpen }) => {
      onOpen?.();
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    });
  });

  afterEach(() => setVisibility("visible"));

  it("releases a hidden tab stream and reconciles after becoming visible", async () => {
    const onReconnect = vi.fn();
    renderHook(() =>
      useTelegramCrmRealtime({
        active: true,
        onEvent: vi.fn(),
        onReconnect,
      }),
    );

    await waitFor(() => expect(fetchCrmEventStream).toHaveBeenCalledTimes(1));
    const firstSignal = vi.mocked(fetchCrmEventStream).mock.calls[0][0].signal;

    act(() => setVisibility("hidden"));
    expect(firstSignal.aborted).toBe(true);

    act(() => setVisibility("visible"));
    await waitFor(() => expect(fetchCrmEventStream).toHaveBeenCalledTimes(2));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("does not open a stream while the tab starts hidden", async () => {
    setVisibility("hidden");
    renderHook(() =>
      useTelegramCrmRealtime({ active: true, onEvent: vi.fn() }),
    );

    await act(() => Promise.resolve());
    expect(fetchCrmEventStream).not.toHaveBeenCalled();
  });

  it("reconciles when the initial handshake was aborted while hiding", async () => {
    vi.mocked(fetchCrmEventStream).mockImplementationOnce(
      ({ signal }) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    const onReconnect = vi.fn();
    renderHook(() =>
      useTelegramCrmRealtime({
        active: true,
        onEvent: vi.fn(),
        onReconnect,
      }),
    );

    await waitFor(() => expect(fetchCrmEventStream).toHaveBeenCalledTimes(1));
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));

    await waitFor(() => expect(fetchCrmEventStream).toHaveBeenCalledTimes(2));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
