import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TELEGRAM_WEB_APP_SDK_FAILED_EVENT,
  TELEGRAM_WEB_APP_SDK_READY_EVENT,
} from "@/components/telegram/telegram-web-app-sdk";
import { useTelegramMiniAppBootstrap } from "./use-telegram-mini-app-bootstrap";

afterEach(() => {
  delete window.Telegram;
  window.history.replaceState({}, "", "/");
  vi.useRealTimers();
});

describe("useTelegramMiniAppBootstrap", () => {
  it("initializes a Telegram Mini App after the route head loads its SDK", async () => {
    const ready = vi.fn();
    const expand = vi.fn();
    window.Telegram = {
      WebApp: {
        initData: "signed-init-data",
        ready,
        expand,
        isExpanded: false,
      },
    };
    const { result } = renderHook(() => useTelegramMiniAppBootstrap());

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        initData: "signed-init-data",
      }),
    );
    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
  });

  it("classifies a direct browser visit without waiting for the SDK", async () => {
    const { result } = renderHook(() => useTelegramMiniAppBootstrap());

    await waitFor(() => expect(result.current).toEqual({ status: "browser" }));
    window.dispatchEvent(new Event(TELEGRAM_WEB_APP_SDK_FAILED_EVENT));
    expect(result.current).toEqual({ status: "browser" });
  });

  it("bootstraps when the SDK arrives after hydration", async () => {
    window.history.replaceState(
      {},
      "",
      "/finance/bot?tgWebAppVersion=8.0&tgWebAppPlatform=android",
    );
    const ready = vi.fn();
    const expand = vi.fn();
    const { result } = renderHook(() => useTelegramMiniAppBootstrap());
    window.Telegram = {
      WebApp: {
        initData: "signed-init-data",
        ready,
        expand,
        isExpanded: false,
      },
    };

    window.dispatchEvent(new Event(TELEGRAM_WEB_APP_SDK_READY_EVENT));

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        initData: "signed-init-data",
      }),
    );
    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
  });

  it("reports a bounded error when a Telegram launch never loads the SDK", async () => {
    vi.useFakeTimers();
    window.history.replaceState(
      {},
      "",
      "/finance/bot#tgWebAppVersion=8.0&tgWebAppPlatform=android",
    );
    const { result } = renderHook(() => useTelegramMiniAppBootstrap());

    expect(result.current).toEqual({ status: "loading" });
    await act(() => vi.advanceTimersByTimeAsync(2_000));

    expect(result.current).toEqual({ status: "error" });
  });

  it("uses signed launch data when the external Telegram SDK does not load", async () => {
    vi.useFakeTimers();
    const initData = "query_id=launch&auth_date=123&hash=abc";
    window.history.replaceState(
      {},
      "",
      `/finance/bot#tgWebAppVersion=8.0&tgWebAppData=${encodeURIComponent(initData)}`,
    );
    const { result } = renderHook(() => useTelegramMiniAppBootstrap());

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    expect(result.current).toEqual({ status: "ready", initData });
  });

  it("keeps an SDK-loaded ordinary browser in browser mode", async () => {
    window.Telegram = { WebApp: { initData: "   " } };

    const { result } = renderHook(() => useTelegramMiniAppBootstrap());

    await waitFor(() => expect(result.current).toEqual({ status: "browser" }));
  });

  it("reports an error when a Telegram launch has no initData", async () => {
    window.history.replaceState(
      {},
      "",
      "/finance/bot#tgWebAppVersion=8.0&tgWebAppPlatform=android",
    );
    window.Telegram = { WebApp: { initData: "   " } };

    const { result } = renderHook(() => useTelegramMiniAppBootstrap());

    await waitFor(() => expect(result.current).toEqual({ status: "error" }));
  });

  it("falls back to signed launch data when the loaded SDK exposes an empty value", async () => {
    const initData = "query_id=launch&auth_date=123&hash=abc";
    window.history.replaceState(
      {},
      "",
      `/finance/bot#tgWebAppVersion=8.0&tgWebAppData=${encodeURIComponent(initData)}`,
    );
    window.Telegram = { WebApp: { initData: "   " } };

    const { result } = renderHook(() => useTelegramMiniAppBootstrap());

    await waitFor(() =>
      expect(result.current).toEqual({ status: "ready", initData }),
    );
  });
});
