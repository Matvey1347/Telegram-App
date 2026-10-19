"use client";

import { useEffect, useState } from "react";
import { GroshlyFinanceApp } from "@finance-web/components/groshly-finance-app";
import { GroshlyLoadingScreen } from "@finance-web/components/groshly-loading-screen";

type FinanceContext = { financeBotId: string };

type FinanceContextState =
  | { status: "loading" }
  | { status: "ready"; financeBotId: string }
  | { status: "error" };

const FINANCE_CONTEXT_CACHE_KEY = "finance-active-bot-id";

function initialFinanceContextState(): FinanceContextState {
  if (typeof window === "undefined") return { status: "loading" };
  const financeBotId = window.localStorage.getItem(FINANCE_CONTEXT_CACHE_KEY)?.trim();
  return financeBotId ? { status: "ready", financeBotId } : { status: "loading" };
}

function readFinanceContext(value: unknown): FinanceContext | null {
  if (!value || typeof value !== "object") return null;
  const financeBotId = (value as { financeBotId?: unknown }).financeBotId;
  return typeof financeBotId === "string" && financeBotId.trim()
    ? { financeBotId }
    : null;
}

export function FinanceRootApp() {
  // Do not wait for an effect just to read public routing metadata that is
  // already in localStorage. This is the first cache gate on every reload.
  const [state, setState] = useState<FinanceContextState>(
    initialFinanceContextState,
  );
  useEffect(() => {
    const controller = new AbortController();

    // This ID is public routing/configuration metadata, not finance data or a
    // credential. Using the last known active bot lets the persisted Finance
    // snapshot render before the optional configuration check comes back.
    const cachedBotId = window.localStorage
      .getItem(FINANCE_CONTEXT_CACHE_KEY)
      ?.trim();
    if (cachedBotId) setState({ status: "ready", financeBotId: cachedBotId });

    async function loadContext() {
      try {
        const response = await fetch("/api/finance/context", {
          credentials: "include",
          signal: controller.signal,
        });
        const context = response.ok ? readFinanceContext(await response.json()) : null;
        if (!context) throw new Error("Finance context is unavailable");
        window.localStorage.setItem(FINANCE_CONTEXT_CACHE_KEY, context.financeBotId);
        setState({ status: "ready", financeBotId: context.financeBotId });
      } catch {
        // A cached route is still safe to use if the lightweight background
        // check is temporarily unavailable. The actual Finance API remains
        // authenticated and validates every data request.
        if (!controller.signal.aborted && !cachedBotId) setState({ status: "error" });
      }
    }

    void loadContext();
    return () => controller.abort();
  }, []);

  if (state.status === "ready") {
    return <GroshlyFinanceApp botId={state.financeBotId} />;
  }

  if (state.status === "loading") {
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
