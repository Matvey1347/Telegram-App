"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Moon, Send, ShieldCheck, Sun } from "lucide-react";
import {
  Button,
  ErrorState,
} from "@consumer-finance/web/components/ui";
import { consumerFinanceAuthApi } from "@consumer-finance/web/lib/api/consumer-finance-auth-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import { normalizeFinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeAuthCopy } from "@consumer-finance/web/components/i18n/auth";
import { financeLandingCopy } from "@consumer-finance/web/components/i18n/landing";
import { useFinanceBotBranding } from "@consumer-finance/web/components/hooks/use-finance-bot-branding";

/** Browser authentication is delegated to the API so Telegram verifies identity server-side. */
export function ConsumerFinanceLogin({
  botId,
  initialLocale = "uk",
  initialTheme = "light",
  onAuthenticated,
}: {
  botId: string;
  initialLocale?: "uk" | "en";
  initialTheme?: "light" | "dark";
  onAuthenticated: () => void;
}) {
  const [locale, setLocale] = useState<"uk" | "en">(initialLocale);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const [preferencesReady, setPreferencesReady] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (!document.cookie.includes("groshly-language=")) {
        const saved = window.localStorage.getItem("groshly-language") || navigator.language;
        setLocale(normalizeFinanceLocale(saved) === "en" ? "en" : "uk");
      }
      if (!document.cookie.includes("groshly-theme=")) {
        setTheme(window.localStorage.getItem("groshly-theme") === "dark" ? "dark" : "light");
      }
      setPreferencesReady(true);
    });
    return () => { active = false; };
  }, []);
  const branding = useFinanceBotBranding(botId);
  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem("groshly-language", locale);
    window.localStorage.setItem("groshly-theme", theme);
    document.cookie = `groshly-language=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `groshly-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = locale;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0c1712" : "#f7f8f4");
  }, [locale, theme, preferencesReady]);
  const t = financeLandingCopy(locale);
  const [waiting, setWaiting] = useState(false);
  const completedToken = useRef<string | null>(null);
  const existingSession = useQuery({
    queryKey: consumerFinanceKeys.session(botId),
    queryFn: () => consumerFinanceAuthApi.session(botId),
    retry: false,
    staleTime: 0,
  });
  useEffect(() => {
    if (existingSession.data?.authenticated && completedToken.current !== "existing-session") {
      completedToken.current = "existing-session";
      onAuthenticated();
    }
  }, [existingSession.data?.authenticated, onAuthenticated]);
  const challenge = useQuery({
    queryKey: consumerFinanceKeys.browserLoginChallenge(botId),
    queryFn: () => consumerFinanceAuthApi.createBrowserLoginChallenge(botId),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    enabled: existingSession.isFetched && !existingSession.data?.authenticated,
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
    <main className="groshly-login" data-theme={theme} lang={locale}>
      <header className="groshly-login-header">
        <a className="groshly-login-brand" href="/"><img src={theme === "dark" ? branding.faviconLightUrl : branding.logoUrl} alt="" /><strong>Groshly<span>.</span></strong></a>
        <div className="groshly-login-controls">
          <div className="landing-language-control" role="group" aria-label="Language">
            <button type="button" aria-pressed={locale === "uk"} onClick={() => setLocale("uk")}>🇺🇦 Українська</button>
            <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>🇬🇧 English</button>
          </div>
          <button className="landing-theme-control" type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Light theme" : "Dark theme"}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
      </header>
      <div className="groshly-login-body">
        <section className="groshly-login-card" aria-labelledby="telegram-login-title">
          <h1 id="telegram-login-title">{t.signInTelegram}</h1>
          <p>{t.signInHelp}</p>
          {challenge.data && approval.data?.status !== "expired" ? (
            <a href={challenge.data.loginUrl} target="_blank" rel="noreferrer" onClick={() => setWaiting(true)} className="groshly-login-button">
              <Send size={19} aria-hidden="true" />{locale === "uk" ? "Продовжити з Telegram" : "Continue with Telegram"}<ArrowRight size={19} aria-hidden="true" />
            </a>
          ) : (
            <button type="button" disabled className="groshly-login-button"><Send size={19} aria-hidden="true" />{locale === "uk" ? "Готуємо вхід…" : "Preparing sign in…"}</button>
          )}
          {waiting ? <p className="groshly-login-waiting" role="status">{t.telegramSignInWaiting}</p> : null}
          {challenge.isError || approval.isError || approval.data?.status === "expired" ? (
            <div className="groshly-login-error"><ErrorState text={approval.data?.status === "expired" ? t.telegramSignInExpired : t.signInUnavailable} /><Button variant="secondary" onClick={() => void retry()}>{t.retry}</Button></div>
          ) : null}
          <div className="groshly-login-security"><ShieldCheck size={18} aria-hidden="true" /><span>{t.landingSecurity}</span></div>
          <a className="groshly-login-back" href="/">← {locale === "uk" ? "На головну" : "Back to home"}</a>
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
