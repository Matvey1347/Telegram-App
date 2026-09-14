import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTelegramSystemBotPostFlow } from "./use-telegram-system-bot-post-flow";

describe("useTelegramSystemBotPostFlow", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("checks a prepared bot workflow after 250ms and imports it immediately", async () => {
    vi.useFakeTimers();
    const prepareImport = vi.fn().mockResolvedValue("workflow-1");
    const readImport = vi.fn().mockResolvedValue({
      ready: true,
      value: { text: "Post from bot" },
    });
    const onImported = vi.fn();
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        prepareImport,
        readImport,
        onImported,
        openBotOnStart: false,
      }),
    );

    await act(async () => result.current.startImport());
    await act(async () => vi.advanceTimersByTimeAsync(249));
    expect(readImport).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(readImport).toHaveBeenCalledTimes(1);
    expect(readImport).toHaveBeenCalledWith("workflow-1");
    expect(onImported).toHaveBeenCalledWith({ text: "Post from bot" });
    expect(result.current.importStatus).toBe("done");
  });

  it("uses the fast 500ms interval while waiting for the bot", async () => {
    vi.useFakeTimers();
    const readImport = vi.fn().mockResolvedValue({ ready: false });
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        prepareImport: vi.fn().mockResolvedValue("workflow-2"),
        readImport,
        openBotOnStart: false,
      }),
    );

    await act(async () => result.current.startImport());
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(readImport).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(499));
    expect(readImport).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(readImport).toHaveBeenCalledTimes(2);
  });

  it("restores a workspace workflow after remount and clears it only after consume", async () => {
    vi.useFakeTimers();
    const storageKey = "system-bot-import:workspace-1";
    const firstRead = vi.fn().mockResolvedValue({ ready: false });
    const first = renderHook(() =>
      useTelegramSystemBotPostFlow({
        storageKey,
        prepareImport: vi.fn().mockResolvedValue("workflow-durable"),
        readImport: firstRead,
        openBotOnStart: false,
      }),
    );

    await act(async () => first.result.current.startImport());
    expect(window.localStorage.getItem(storageKey)).toBe("workflow-durable");
    first.unmount();

    const onImported = vi.fn();
    const restoredRead = vi.fn().mockResolvedValue({
      ready: true,
      value: { text: "Persisted post" },
    });
    const restored = renderHook(() =>
      useTelegramSystemBotPostFlow({
        storageKey,
        readImport: restoredRead,
        onImported,
        openBotOnStart: false,
      }),
    );

    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(restored.result.current.workflowId).toBe("workflow-durable");
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(restoredRead).toHaveBeenCalledWith("workflow-durable");
    expect(onImported).toHaveBeenCalledWith({ text: "Persisted post" });
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(restored.result.current.importStatus).toBe("done");
  });

  it("pauses import polling while the document is hidden", async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    const readImport = vi.fn().mockResolvedValue({ ready: false });
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        prepareImport: vi.fn().mockResolvedValue("workflow-hidden"),
        readImport,
        openBotOnStart: false,
      }),
    );

    await act(async () => result.current.startImport());
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(readImport).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(readImport).toHaveBeenCalledTimes(1);
  });

  it("allows a manual check after the automatic polling deadline", async () => {
    vi.useFakeTimers();
    const readImport = vi.fn().mockResolvedValue({ ready: false });
    const { result } = renderHook(() =>
      useTelegramSystemBotPostFlow({
        prepareImport: vi.fn().mockResolvedValue("workflow-long"),
        readImport,
        openBotOnStart: false,
      }),
    );

    await act(async () => result.current.startImport());
    await act(async () => vi.advanceTimersByTimeAsync(121_000));
    const callsAtDeadline = readImport.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(readImport).toHaveBeenCalledTimes(callsAtDeadline);

    await act(async () => result.current.checkImport());
    expect(readImport).toHaveBeenCalledTimes(callsAtDeadline + 1);
  });

  it("ignores a completed read from the previous workspace", async () => {
    let resolveRead: (
      value: { ready: true; value: { text: string } },
    ) => void = () => undefined;
    const readImport = vi.fn(
      () =>
        new Promise<{ ready: true; value: { text: string } }>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const importedInWorkspaceA = vi.fn();
    const importedInWorkspaceB = vi.fn();
    const { result, rerender } = renderHook(
      ({ storageKey, onImported }) =>
        useTelegramSystemBotPostFlow({
          storageKey,
          prepareImport: vi.fn().mockResolvedValue("workflow-a"),
          readImport,
          onImported,
          openBotOnStart: false,
        }),
      {
        initialProps: {
          storageKey: "system-bot-import:workspace-a",
          onImported: importedInWorkspaceA,
        },
      },
    );

    await act(async () => result.current.startImport());
    let pendingCheck!: Promise<boolean>;
    act(() => {
      pendingCheck = result.current.checkImport();
    });
    rerender({
      storageKey: "system-bot-import:workspace-b",
      onImported: importedInWorkspaceB,
    });

    await act(async () => {
      resolveRead({ ready: true, value: { text: "Workspace A post" } });
      await pendingCheck;
    });

    expect(importedInWorkspaceA).not.toHaveBeenCalled();
    expect(importedInWorkspaceB).not.toHaveBeenCalled();
    expect(result.current.importStatus).not.toBe("done");
  });
});
