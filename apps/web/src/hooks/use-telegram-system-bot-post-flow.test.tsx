import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTelegramSystemBotPostFlow } from "./use-telegram-system-bot-post-flow";

describe("useTelegramSystemBotPostFlow", () => {
  afterEach(() => {
    vi.useRealTimers();
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
});
