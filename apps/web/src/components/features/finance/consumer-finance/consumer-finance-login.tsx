"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, ErrorState, LoadingState } from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/query-keys";

/** Browser authentication is delegated to the API so Telegram verifies identity server-side. */
export function ConsumerFinanceLogin({ botId }: { botId: string }) {
  const returnTo = typeof window === "undefined" ? `/finance/${botId}` : window.location.pathname;
  const config = useQuery({
    queryKey: consumerFinanceKeys.browserLoginConfig(botId),
    queryFn: () => consumerFinanceApi.browserLoginConfig(botId, returnTo),
    retry: false,
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4 text-neutral-100">
      <section className="w-full rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Personal Finance</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in with Telegram</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Use the Telegram account connected to your Finance bot. Your data stays the same in Telegram and the browser.
        </p>
        {config.isLoading ? <LoadingState text="Loading Telegram sign in…" /> : null}
        {config.isError ? <ErrorState text="Telegram sign in is unavailable. Please try again later." /> : null}
        {config.data ? <TelegramLoginWidget {...config.data} /> : null}
      </section>
    </div>
  );
}

function TelegramLoginWidget({
  botUsername,
  callbackUrl,
}: {
  botUsername: string;
  callbackUrl: string;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    target.replaceChildren();
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername.replace(/^@/, ""));
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-auth-url", callbackUrl);
    script.setAttribute("data-request-access", "write");
    target.appendChild(script);
    return () => target.replaceChildren();
  }, [botUsername, callbackUrl]);

  return <div className="mt-5 min-h-10" ref={container} aria-label="Telegram sign in" />;
}

export function ConsumerFinanceBootstrapError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <ErrorState text="Finance could not be opened. Please try again." />
      <Button onClick={onRetry}>Retry</Button>
    </div>
  );
}
