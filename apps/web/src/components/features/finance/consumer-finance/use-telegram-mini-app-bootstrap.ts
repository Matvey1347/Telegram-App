"use client";

import { useEffect, useState } from "react";
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
  | { status: "unsupported" }
  | { status: "ready"; initData: string };

export function useTelegramMiniAppBootstrap(): TelegramMiniAppBootstrap {
  const [state, setState] = useState<TelegramMiniAppBootstrap>({ status: "loading" });

  useEffect(() => {
    const bootstrap = () => {
      const webApp = window.Telegram?.WebApp;
      if (!webApp) return false;

      webApp.ready?.();
      if (!webApp.isExpanded) webApp.expand?.();
      const initData = webApp.initData?.trim();
      setState(initData ? { status: "ready", initData } : { status: "unsupported" });
      return true;
    };

    if (bootstrap()) return;

    const reportUnsupported = () => setState({ status: "unsupported" });
    window.addEventListener(TELEGRAM_WEB_APP_SDK_READY_EVENT, bootstrap, { once: true });
    window.addEventListener(TELEGRAM_WEB_APP_SDK_FAILED_EVENT, reportUnsupported, { once: true });

    return () => {
      window.removeEventListener(TELEGRAM_WEB_APP_SDK_READY_EVENT, bootstrap);
      window.removeEventListener(TELEGRAM_WEB_APP_SDK_FAILED_EVENT, reportUnsupported);
    };
  }, []);

  return state;
}
