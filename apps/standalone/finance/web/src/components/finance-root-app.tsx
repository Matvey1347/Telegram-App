"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ConsumerFinanceApp } from "@consumer-finance/web/components/app/consumer-finance-app";
import {
  financeCoreCopy,
  normalizeFinanceLocale,
} from "@consumer-finance/web/components/i18n/core";

type FinanceContext = { financeBotId: string };

type FinanceContextState =
  | { status: "loading" }
  | { status: "ready"; financeBotId: string }
  | { status: "error" };

function currentLocale() {
  return normalizeFinanceLocale(
    typeof navigator === "undefined" ? undefined : navigator.language,
  );
}

const serverLocale = normalizeFinanceLocale(undefined);

function subscribeToLocale() {
  return () => {};
}

function readFinanceContext(value: unknown): FinanceContext | null {
  if (!value || typeof value !== "object") return null;
  const financeBotId = (value as { financeBotId?: unknown }).financeBotId;
  return typeof financeBotId === "string" && financeBotId.trim()
    ? { financeBotId }
    : null;
}

export function FinanceRootApp() {
  const [state, setState] = useState<FinanceContextState>({ status: "loading" });
  // The first browser render must use the same locale as SSR. Resolve the
  // navigator locale only after hydration, otherwise a Russian browser can
  // render "Загрузка…" where the server emitted "Loading…".
  const locale = useSyncExternalStore(
    subscribeToLocale,
    currentLocale,
    () => serverLocale,
  );
  const t = financeCoreCopy(locale);

  useEffect(() => {
    const controller = new AbortController();

    async function loadContext() {
      try {
        const response = await fetch("/api/finance/context", {
          credentials: "include",
          signal: controller.signal,
        });
        const context = response.ok ? readFinanceContext(await response.json()) : null;
        if (!context) throw new Error("Finance context is unavailable");
        setState({ status: "ready", financeBotId: context.financeBotId });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    }

    void loadContext();
    return () => controller.abort();
  }, []);

  if (state.status === "ready") {
    return <ConsumerFinanceApp botId={state.financeBotId} />;
  }

  if (state.status === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-neutral-950 p-4 text-neutral-100">
        <p aria-live="polite">{t.loading}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 p-4 text-neutral-100">
      <div className="max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <p>{t.bootstrapError}</p>
        <button
          className="mt-3 min-h-11 rounded-lg px-3 text-sky-300"
          onClick={() => window.location.reload()}
        >
          {t.retry}
        </button>
      </div>
    </main>
  );
}

export { readFinanceContext };
