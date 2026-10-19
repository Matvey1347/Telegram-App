"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button, ErrorState, LoadingState, WaitingState } from "@consumer-finance/web/components/ui";
import { consumerFinanceAuthApi } from "@consumer-finance/web/lib/api/consumer-finance-auth-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import { normalizeFinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeAuthCopy } from "@consumer-finance/web/components/i18n/auth";

function GroshlyMark() {
  return (
    <svg viewBox="0 0 44 44" fill="none" aria-hidden="true" className="h-11 w-11 shrink-0">
      <rect width="44" height="44" rx="14" fill="#103E30" />
      <path
        d="M29.3 15.7a11.1 11.1 0 1 0 1.2 12.9v-6.3h-8.1"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="33.7" cy="10.6" r="4" fill="#D3F18B" />
    </svg>
  );
}

/** Browser authentication is delegated to the API so Telegram verifies identity server-side. */
export function ConsumerFinanceLogin({
  botId,
  onAuthenticated,
}: {
  botId: string;
  onAuthenticated: () => void;
}) {
  const t = financeAuthCopy(
    normalizeFinanceLocale(
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
  );
  const [waiting, setWaiting] = useState(false);
  const completedToken = useRef<string | null>(null);
  const challenge = useQuery({
    queryKey: consumerFinanceKeys.browserLoginChallenge(botId),
    queryFn: () => consumerFinanceAuthApi.createBrowserLoginChallenge(botId),
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
      consumerFinanceAuthApi.consumeBrowserLoginChallenge(
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
    <main className="min-h-dvh bg-[#f7f8f4] px-4 py-8 text-[#18382d] md:px-8 md:py-12">
      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-5xl items-center gap-10 md:grid-cols-[1.1fr_.9fr]">
      <div className="hidden md:block">
        <div className="flex items-center gap-3">
          <GroshlyMark />
          <p className="text-xl font-extrabold tracking-tight">Groshly</p>
        </div>
        <p className="mt-10 text-xs font-bold uppercase tracking-[0.22em] text-[#82958b]">
          {"YOUR FINANCES"}
        </p>
        <h2 className="mt-3 max-w-xl text-4xl font-semibold leading-tight tracking-tight">
          {t.onboardingTitle}
        </h2>
        <p className="mt-4 max-w-lg text-[#82958b]">{t.signInHelp}</p>
      </div>
      <section className="w-full rounded-[29px] border border-[#e4ebe3] bg-white p-6 shadow-[0_12px_36px_rgba(21,58,41,0.05)] md:p-8">
        <div className="mb-6 flex items-center gap-3 md:hidden">
          <GroshlyMark />
          <p className="text-xl font-extrabold tracking-tight">Groshly</p>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t.signInTelegram}</h1>
        <p className="mt-2 text-sm text-[#82958b]">{t.signInHelp}</p>
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
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[17px] bg-[#229ED9] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1b8fc5] focus:outline-none focus:ring-2 focus:ring-[#98c876]"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {t.telegramSignIn}
            </a>
            {waiting ? (
              <WaitingState
                text={t.telegramSignInWaiting}
                context="settings"
                compact
              />
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
    </main>
  );
}

export function ConsumerFinanceBootstrapError({
  onRetry,
  locale,
}: {
  onRetry: () => void;
  locale?: string | null;
}) {
  const t = financeAuthCopy(
    normalizeFinanceLocale(
      locale ??
        (typeof navigator === "undefined" ? undefined : navigator.language),
    ),
  );
  return (
    <div className="space-y-3">
      <ErrorState text={t.bootstrapError} />
      <Button onClick={onRetry}>{t.retry}</Button>
    </div>
  );
}
