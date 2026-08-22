"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button, ErrorState, LoadingState } from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { financeCopy, normalizeFinanceLocale } from "./finance-i18n";

/** Browser authentication is delegated to the API so Telegram verifies identity server-side. */
export function ConsumerFinanceLogin({
  botId,
  onAuthenticated,
}: {
  botId: string;
  onAuthenticated: () => void;
}) {
  const t = financeCopy(
    normalizeFinanceLocale(
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
  );
  const [waiting, setWaiting] = useState(false);
  const completedToken = useRef<string | null>(null);
  const challenge = useQuery({
    queryKey: consumerFinanceKeys.browserLoginChallenge(botId),
    queryFn: () => consumerFinanceApi.createBrowserLoginChallenge(botId),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
  const approval = useQuery({
    queryKey: consumerFinanceKeys.browserLoginApproval(
      botId,
      challenge.data?.token || "pending",
    ),
    queryFn: () =>
      consumerFinanceApi.consumeBrowserLoginChallenge(
        botId,
        challenge.data!.token,
      ),
    enabled: waiting && Boolean(challenge.data?.token),
    retry: false,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 1_500 : false,
  });

  useEffect(() => {
    if (
      approval.data?.status !== "authenticated" ||
      !challenge.data?.token ||
      completedToken.current === challenge.data.token
    ) {
      return;
    }
    completedToken.current = challenge.data.token;
    onAuthenticated();
  }, [approval.data, challenge.data?.token, onAuthenticated]);

  const retry = async () => {
    setWaiting(false);
    completedToken.current = null;
    await challenge.refetch();
  };

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
        {challenge.isLoading ? <LoadingState text={t.loadingSignIn} /> : null}
        {challenge.isError || approval.isError ? (
          <div className="mt-4 space-y-3">
            <ErrorState text={t.signInUnavailable} />
            <Button variant="secondary" onClick={() => void retry()}>
              {t.retry}
            </Button>
          </div>
        ) : null}
        {challenge.data && approval.data?.status !== "expired" ? (
          <div className="mt-5 space-y-3">
            <a
              href={challenge.data.loginUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setWaiting(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#229ED9] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1b8fc5] focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {t.telegramSignIn}
            </a>
            {waiting ? (
              <p className="text-sm text-neutral-400" role="status">
                {t.telegramSignInWaiting}
              </p>
            ) : null}
          </div>
        ) : null}
        {approval.data?.status === "expired" ? (
          <div className="mt-4 space-y-3">
            <ErrorState text={t.telegramSignInExpired} />
            <Button variant="secondary" onClick={() => void retry()}>
              {t.retry}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function ConsumerFinanceBootstrapError({
  onRetry,
  locale,
}: {
  onRetry: () => void;
  locale?: string | null;
}) {
  const t = financeCopy(
    normalizeFinanceLocale(
      locale ?? (typeof navigator === "undefined" ? undefined : navigator.language),
    ),
  );
  return (
    <div className="space-y-3">
      <ErrorState text={t.bootstrapError} />
      <Button onClick={onRetry}>{t.retry}</Button>
    </div>
  );
}
