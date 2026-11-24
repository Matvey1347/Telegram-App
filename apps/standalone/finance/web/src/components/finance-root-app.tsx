"use client";

import { useEffect, useState } from "react";
import { GroshlyFinanceApp } from "@finance-web/components/groshly-finance-app";
import { GroshlyLoadingScreen } from "@finance-web/components/groshly-loading-screen";
import { GroshlyStartupError } from "@finance-web/components/groshly-startup-error";
import { GroshlyDeviceTransferLogin } from "@finance-web/components/groshly-device-transfer";
import { ConsumerFinanceLogin } from "@consumer-finance/web/components/app/consumer-finance-login";
import { useTelegramMiniAppBootstrap } from "@consumer-finance/web/components/hooks/use-telegram-mini-app-bootstrap";

import type { ConsumerFinanceBrowserContext as FinanceContext } from "@telegram-system/shared";

type FinanceContextState =
  | { status: "loading" }
  | ({ status: "ready" } & FinanceContext)
  | { status: "error" };

function readFinanceContext(value: unknown): FinanceContext | null {
  if (!value || typeof value !== "object") return null;
  const { financeBotId, supportBotUsername } = value as Partial<FinanceContext>;
  if (typeof financeBotId !== "string" || !financeBotId.trim()) return null;
  return {
    financeBotId,
    ...(typeof supportBotUsername === "string" &&
      /^[a-z][a-z0-9_]{3,31}$/i.test(supportBotUsername)
      ? { supportBotUsername }
      : {}),
  };
}

export function FinanceRootApp({ botId, entry = "app", initialLocale = "uk", initialTheme = "light" }: { botId?: string; entry?: "app" | "login"; initialLocale?: "uk" | "en"; initialTheme?: "light" | "dark" } = {}) {
  const bootstrap = useTelegramMiniAppBootstrap();
  const [state, setState] = useState<FinanceContextState>(() =>
    botId ? { status: "ready", financeBotId: botId } : { status: "loading" },
  );
  useEffect(() => {
    if (botId) return;
    const controller = new AbortController();

    async function loadContext() {
      try {
        const response = await fetch("/api/finance/context", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        const context = response.ok ? readFinanceContext(await response.json()) : null;
        if (!context) throw new Error("Finance context is unavailable");
        if (controller.signal.aborted) return;
        setState({ ...context, status: "ready" });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    }

    void loadContext();
    return () => controller.abort();
  }, [botId]);

  const activeBotId = botId ?? (state.status === "ready" ? state.financeBotId : undefined);
  if (activeBotId && bootstrap.status === "error") {
    return <GroshlyStartupError telegram onRetry={() => window.location.reload()} />;
  }

  if (activeBotId && (bootstrap.status === "ready" || bootstrap.status === "browser")) {
    if (entry === "login" && bootstrap.status === "browser") {
      const openApp = () => window.location.replace("/app");
      return <ConsumerFinanceLogin
        key={activeBotId}
        botId={activeBotId}
        initialLocale={initialLocale}
        initialTheme={initialTheme}
        onAuthenticated={openApp}
        renderDeviceTransfer={(locale) => <GroshlyDeviceTransferLogin botId={activeBotId} locale={locale} onAuthenticated={openApp} />}
      />;
    }
    return <GroshlyFinanceApp key={activeBotId} botId={activeBotId} bootstrap={bootstrap} supportBotUsername={state.status === "ready" ? state.supportBotUsername : undefined} />;
  }

  if (state.status === "loading" || bootstrap.status === "loading") {
    return <GroshlyLoadingScreen />;
  }

  return <GroshlyStartupError onRetry={() => window.location.reload()} />;
}

export { readFinanceContext };
