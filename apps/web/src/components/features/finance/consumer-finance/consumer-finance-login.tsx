"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, ErrorState, LoadingState } from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { financeCopy, normalizeFinanceLocale } from "./finance-i18n";

/** Browser authentication is delegated to the API so Telegram verifies identity server-side. */
export function ConsumerFinanceLogin({ botId }: { botId: string }) {
  const t = financeCopy(
    normalizeFinanceLocale(
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
  );
  const returnTo =
    typeof window === "undefined"
      ? `/finance/${botId}`
      : window.location.pathname;
  const config = useQuery({
    queryKey: consumerFinanceKeys.browserLoginConfig(botId),
    queryFn: () => consumerFinanceApi.browserLoginConfig(botId, returnTo),
    retry: false,
  });

  return (
    <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-10 px-4 py-10 text-neutral-100 md:grid-cols-[1.1fr_.9fr] md:px-8">
      <div className="hidden md:block">
        <p className="text-xs uppercase tracking-[0.22em] text-sky-300">
          Finance
        </p>
        <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight">
          {t.onboardingTitle}
        </h2>
        <p className="mt-4 max-w-lg text-neutral-400">{t.signInHelp}</p>
      </div>
      <section className="w-full rounded-lg border border-neutral-800 bg-neutral-900 p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">
          {t.personalFinance}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{t.signInTelegram}</h1>
        <p className="mt-2 text-sm text-neutral-400">{t.signInHelp}</p>
        {config.isLoading ? <LoadingState text={t.loadingSignIn} /> : null}
        {config.isError ? <ErrorState text={t.signInUnavailable} /> : null}
        {config.data ? (
          <TelegramLoginWidget {...config.data} label={t.telegramSignIn} />
        ) : null}
      </section>
    </div>
  );
}

function TelegramLoginWidget({
  botUsername,
  callbackUrl,
  label,
}: {
  botUsername: string;
  callbackUrl: string;
  label: string;
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

  return <div className="mt-5 min-h-10" ref={container} aria-label={label} />;
}

export function ConsumerFinanceBootstrapError({
  onRetry,
}: {
  onRetry: () => void;
}) {
  const t = financeCopy(
    normalizeFinanceLocale(
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
  );
  return (
    <div className="space-y-3">
      <ErrorState text={t.bootstrapError} />
      <Button onClick={onRetry}>{t.retry}</Button>
    </div>
  );
}
