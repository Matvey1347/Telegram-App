"use client";

import { useEffect, useState } from "react";
import { GroshlyFinanceApp } from "@finance-web/components/groshly-finance-app";
import { GroshlyLoadingScreen } from "@finance-web/components/groshly-loading-screen";
import { ConsumerFinanceBootstrapError, ConsumerFinanceLogin } from "@consumer-finance/web/components/app/consumer-finance-login";
import { useTelegramMiniAppBootstrap } from "@consumer-finance/web/components/hooks/use-telegram-mini-app-bootstrap";

type FinanceContext = { financeBotId: string };

type FinanceContextState =
  | { status: "loading" }
  | { status: "ready"; financeBotId: string }
  | { status: "error" };

function readFinanceContext(value: unknown): FinanceContext | null {
  if (!value || typeof value !== "object") return null;
  const financeBotId = (value as { financeBotId?: unknown }).financeBotId;
  return typeof financeBotId === "string" && financeBotId.trim()
    ? { financeBotId }
    : null;
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
        setState({ status: "ready", financeBotId: context.financeBotId });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    }

    void loadContext();
    return () => controller.abort();
  }, [botId]);

  const activeBotId = botId ?? (state.status === "ready" ? state.financeBotId : undefined);
  if (activeBotId && bootstrap.status === "error") {
    return <ConsumerFinanceBootstrapError locale={initialLocale} onRetry={() => window.location.reload()} />;
  }

  if (activeBotId && (bootstrap.status === "ready" || bootstrap.status === "browser")) {
    if (entry === "login" && bootstrap.status === "browser") {
      return <ConsumerFinanceLogin key={activeBotId} botId={activeBotId} initialLocale={initialLocale} initialTheme={initialTheme} onAuthenticated={() => window.location.replace("/app")} />;
    }
    return <GroshlyFinanceApp key={activeBotId} botId={activeBotId} bootstrap={bootstrap} />;
  }

  if (state.status === "loading" || bootstrap.status === "loading") {
    return <GroshlyLoadingScreen />;
  }

  return (
    <main className="app-shell">
      <div className="busy-cover">
        <div className="busy-card">
          <b>Unable to open Groshly.</b>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    </main>
  );
}

export { readFinanceContext };
