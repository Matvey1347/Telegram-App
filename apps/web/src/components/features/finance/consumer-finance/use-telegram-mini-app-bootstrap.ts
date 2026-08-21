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

function initialBootstrapState(): TelegramMiniAppBootstrap {
  if (typeof window === "undefined") return { status: "loading" };
  const webApp = window.Telegram?.WebApp;
  const initData = webApp?.initData?.trim();
  if (initData) return { status: "ready", initData };
  // The public SDK creates an empty WebApp object in ordinary browsers too.
  // Only Telegram launch parameters make that empty object a Mini App signal.
  if (hasTelegramLaunchSignal(window.location)) {
    return { status: "loading" };
  }
  return { status: "browser" };
}

export function useTelegramMiniAppBootstrap(): TelegramMiniAppBootstrap {
  const configuredWebApp = useRef(false);
  const [state, setState] = useState<TelegramMiniAppBootstrap>(
    initialBootstrapState,
  );

  useEffect(() => {
    const bootstrap = () => {
      const webApp = window.Telegram?.WebApp;
      if (!webApp) return false;

      if (!configuredWebApp.current) {
        configuredWebApp.current = true;
        webApp.ready?.();
        if (!webApp.isExpanded) webApp.expand?.();
      }
      const initData = webApp.initData?.trim();
      setState(
        initData ? { status: "ready", initData } : { status: "error" },
      );
      return true;
    };

    // Browser classification is deliberately immediate and sticky. Loading
    // Telegram's SDK globally must not turn a normal browser visit into a Mini App.
    if (state.status === "browser" || state.status === "error") return;
    if (state.status === "ready" && configuredWebApp.current) return;
    if (bootstrap()) return;

    const reportError = () => setState({ status: "error" });
    const timeout = window.setTimeout(reportError, SDK_LOAD_TIMEOUT_MS);
    window.addEventListener(TELEGRAM_WEB_APP_SDK_READY_EVENT, bootstrap, {
      once: true,
    });
    window.addEventListener(
      TELEGRAM_WEB_APP_SDK_FAILED_EVENT,
      reportError,
      { once: true },
    );

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(TELEGRAM_WEB_APP_SDK_READY_EVENT, bootstrap);
      window.removeEventListener(
        TELEGRAM_WEB_APP_SDK_FAILED_EVENT,
        reportError,
      );
    };
  }, [state.status]);

  return state;
}
