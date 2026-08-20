import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TELEGRAM_WEB_APP_SDK_FAILED_EVENT, TELEGRAM_WEB_APP_SDK_READY_EVENT } from "@/components/telegram/telegram-web-app-sdk";
import { useTelegramMiniAppBootstrap } from "./use-telegram-mini-app-bootstrap";

afterEach(() => {
  delete window.Telegram;
});

describe("useTelegramMiniAppBootstrap", () => {
  it("initializes a Telegram Mini App after the route head loads its SDK", async () => {
    const ready = vi.fn();
    const expand = vi.fn();
    window.Telegram = {
      WebApp: { initData: "signed-init-data", ready, expand, isExpanded: false },
    };
    const { result } = renderHook(() => useTelegramMiniAppBootstrap());

    await waitFor(() => expect(result.current).toEqual({ status: "ready", initData: "signed-init-data" }));
    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
  });

  it("waits for the SDK event before reporting an unsupported context", async () => {
    const { result } = renderHook(() => useTelegramMiniAppBootstrap());

    expect(result.current).toEqual({ status: "loading" });
    window.dispatchEvent(new Event(TELEGRAM_WEB_APP_SDK_FAILED_EVENT));
    await waitFor(() => expect(result.current).toEqual({ status: "unsupported" }));
  });

  it("bootstraps when the SDK arrives after hydration", async () => {
    const { result } = renderHook(() => useTelegramMiniAppBootstrap());
    window.Telegram = { WebApp: { initData: "signed-init-data" } };

    window.dispatchEvent(new Event(TELEGRAM_WEB_APP_SDK_READY_EVENT));

    await waitFor(() => expect(result.current).toEqual({ status: "ready", initData: "signed-init-data" }));
  });
});
