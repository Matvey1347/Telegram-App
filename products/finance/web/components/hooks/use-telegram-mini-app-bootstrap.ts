"use client";

import { useEffect, useRef, useState } from "react";
import {
  TELEGRAM_WEB_APP_SDK_FAILED_EVENT,
  TELEGRAM_WEB_APP_SDK_READY_EVENT,
} from "@/components/telegram/telegram-web-app-sdk";

type TelegramWebApp = {
  initData?: string;
  isExpanded?: boolean;
  ready?: () => void;
  expand?: () => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export type TelegramMiniAppBootstrap =
  | { status: "loading" }
  | { status: "browser" }
  | { status: "error" }
  | { status: "ready"; initData: string };

const SDK_LOAD_TIMEOUT_MS = 2_000;

function hasTelegramLaunchSignal(location: Location) {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  return [search, hash].some(
    (params) =>
      params.has("tgWebAppData") ||
      params.has("tgWebAppVersion") ||
      params.has("tgWebAppPlatform") ||
      params.has("tgWebAppThemeParams"),
  );
}

function telegramInitDataFromLocation(location: Location) {
  const sources = [
    new URLSearchParams(location.search),
    new URLSearchParams(location.hash.replace(/^#/, "")),
  ];
  for (const params of sources) {
    const initData = params.get("tgWebAppData")?.trim();
    if (initData) return initData;
  }
  return null;
}

export function useTelegramMiniAppBootstrap(): TelegramMiniAppBootstrap {
  const configuredWebApp = useRef(false);
  // The first browser render must match SSR. Environment detection happens in
  // the effect so React never hydrates a Telegram shell as a browser shell.
  const [state, setState] = useState<TelegramMiniAppBootstrap>({
    status: "loading",
  });

  useEffect(() => {
    let disposed = false;
    const commit = (next: TelegramMiniAppBootstrap) => {
      window.queueMicrotask(() => {
        if (!disposed) setState(next);
      });
    };
    const telegramLaunch = hasTelegramLaunchSignal(window.location);
    const launchInitData = telegramInitDataFromLocation(window.location);
    const bootstrap = () => {
      const webApp = window.Telegram?.WebApp;
      if (!webApp) return false;

      const initData = webApp.initData?.trim() || launchInitData;
      if (!initData) {
        commit({ status: telegramLaunch ? "error" : "browser" });
        return true;
      }

      if (!configuredWebApp.current) {
        configuredWebApp.current = true;
        webApp.ready?.();
        if (!webApp.isExpanded) webApp.expand?.();
      }
      commit({ status: "ready", initData });
      return true;
    };

    if (bootstrap()) return () => void (disposed = true);
    if (!telegramLaunch) {
      commit({ status: "browser" });
      return () => void (disposed = true);
    }

    const reportError = () =>
      commit(
        launchInitData
          ? { status: "ready", initData: launchInitData }
          : { status: "error" },
      );
    const timeout = window.setTimeout(reportError, SDK_LOAD_TIMEOUT_MS);
    window.addEventListener(TELEGRAM_WEB_APP_SDK_READY_EVENT, bootstrap, {
      once: true,
    });
    window.addEventListener(TELEGRAM_WEB_APP_SDK_FAILED_EVENT, reportError, {
      once: true,
    });

    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      window.removeEventListener(TELEGRAM_WEB_APP_SDK_READY_EVENT, bootstrap);
      window.removeEventListener(
        TELEGRAM_WEB_APP_SDK_FAILED_EVENT,
        reportError,
      );
    };
  }, []);

  return state;
}
