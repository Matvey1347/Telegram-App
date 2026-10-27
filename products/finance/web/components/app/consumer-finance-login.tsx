"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Send, ShieldCheck } from "lucide-react";
import {
  Button,
  ErrorState,
} from "@consumer-finance/web/components/ui";
import { consumerFinanceAuthApi } from "@consumer-finance/web/lib/api/consumer-finance-auth-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import { normalizeFinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeAuthCopy } from "@consumer-finance/web/components/i18n/auth";
import { financeLandingCopy } from "@consumer-finance/web/components/i18n/landing";
import { ConsumerFinanceLanding } from "@consumer-finance/web/components/app/consumer-finance-landing";
import { useFinanceBotBranding } from "@consumer-finance/web/components/hooks/use-finance-bot-branding";

/** Browser authentication is delegated to the API so Telegram verifies identity server-side. */
export function ConsumerFinanceLogin({
  botId,
  onAuthenticated,
}: {
  botId: string;
  onAuthenticated: () => void;
}) {
  const [locale, setLocale] = useState<"uk" | "en">("uk");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [preferencesReady, setPreferencesReady] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const saved = window.localStorage.getItem("groshly-language") || navigator.language;
      setLocale(normalizeFinanceLocale(saved) === "en" ? "en" : "uk");
      setTheme(window.localStorage.getItem("groshly-theme") === "dark" ? "dark" : "light");
      setPreferencesReady(true);
    });
    return () => { active = false; };
  }, []);
  const branding = useFinanceBotBranding(botId);
  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem("groshly-language", locale);
    window.localStorage.setItem("groshly-theme", theme);
    document.documentElement.lang = locale;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0c1712" : "#f7f8f4");
  }, [locale, theme, preferencesReady]);
  const t = financeLandingCopy(locale);
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
    <ConsumerFinanceLanding
      locale={locale}
      botId={botId}
      iconUrl={theme === "dark" ? branding.faviconLightUrl : branding.faviconUrl}
      theme={theme}
      onThemeChange={() => setTheme((current) => current === "dark" ? "light" : "dark")}
      onLocaleChange={(value) => setLocale(value === "en" ? "en" : "uk")}
      loginUrl={
        challenge.data && approval.data?.status !== "expired"
          ? challenge.data.loginUrl
          : undefined
      }
      onLoginClick={() => setWaiting(true)}
      login={
        <section
          className="landing-login-card"
          aria-labelledby="telegram-login-title"
        >
          <div className="landing-login-icon">
            <Send size={25} aria-hidden="true" />
          </div>
          <h3 id="telegram-login-title">{t.signInTelegram}</h3>
          <p>{t.signInHelp}</p>
          {challenge.data && approval.data?.status !== "expired" ? (
            <a
              href={challenge.data.loginUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setWaiting(true)}
              className="landing-login-button"
            >
              <Send size={19} aria-hidden="true" />
              {t.landingCta}
              <ArrowRight size={19} aria-hidden="true" />
            </a>
          ) : (
            <button type="button" disabled className="landing-login-button">
              <Send size={19} aria-hidden="true" />
              {t.landingCta}
              <ArrowRight size={19} aria-hidden="true" />
            </button>
          )}
          {waiting ? <p className="landing-login-waiting" role="status">{t.telegramSignInWaiting}</p> : null}
          {challenge.isError ||
          approval.isError ||
          approval.data?.status === "expired" ? (
            <div className="landing-login-error">
              <ErrorState
                text={
                  approval.data?.status === "expired"
                    ? t.telegramSignInExpired
                    : t.signInUnavailable
                }
              />
              <Button variant="secondary" onClick={() => void retry()}>
                {t.retry}
              </Button>
            </div>
          ) : null}
          <div className="landing-login-security">
            <ShieldCheck size={19} aria-hidden="true" />
            <span>{t.landingSecurity}</span>
          </div>
        </section>
      }
    />
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
