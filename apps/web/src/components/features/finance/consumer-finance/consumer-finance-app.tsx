"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConsumerFinanceScreens } from "./consumer-finance-screens";
import { useTelegramMiniAppBootstrap } from "./use-telegram-mini-app-bootstrap";
import { consumerFinanceAuthApi } from "@/lib/features/finance/consumer-finance-auth-api";
import { consumerFinanceProfileApi } from "@/lib/features/finance/consumer-finance-profile-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  ConsumerFinanceBootstrapError,
  ConsumerFinanceLogin,
} from "./consumer-finance-login";
import type {
  ConsumerFinanceProfile,
  ConsumerFinanceSessionState,
} from "@telegram-system/shared";
import { financeCoreCopy, normalizeFinanceLocale } from "./i18n/core";
import { FinanceMiniAppShell } from "./finance-mini-app-shell";
import { FinanceWebAppShell } from "./finance-web-app-shell";
import { LoadingState } from "./ui";
import {
  FinanceVisualContextProvider,
  financeVisualContextForScreen,
} from "./ui/finance-visual-context";
import {
  consumerFinanceAccountUrl,
  consumerFinanceInvestmentUrl,
  consumerFinanceScreenUrl,
  financeSurfaceForBootstrap,
  hasConsumerFinanceRegularPaymentTarget,
  readConsumerFinanceAccountId,
  readConsumerFinanceInvestmentId,
  readConsumerFinanceRegularPaymentTarget,
  readConsumerFinanceScreen,
  type ConsumerFinanceAction,
  type ConsumerFinanceScreen,
} from "./consumer-finance-navigation";
import { useFinanceBotBranding } from "./use-finance-bot-branding";

const subscribeToStaticBrowserState = () => () => undefined;

export function ConsumerFinanceApp({ botId }: { botId: string }) {
  const queryClient = useQueryClient();
  const branding = useFinanceBotBranding(botId);
  const localeStorageKey = `consumer-finance-locale:${botId}`;
  const bootstrap = useTelegramMiniAppBootstrap();
  const session = useQuery({
    queryKey: consumerFinanceKeys.session(botId),
    queryFn: async (): Promise<ConsumerFinanceSessionState> => {
      const existing = await consumerFinanceAuthApi.session(botId);
      if (existing.authenticated || bootstrap.status !== "ready") {
        return existing;
      }
      return consumerFinanceAuthApi.auth(botId, bootstrap.initData);
    },
    enabled: bootstrap.status === "browser" || bootstrap.status === "ready",
    retry: false,
    refetchOnReconnect: false,
  });
  const browserTransfer = useMutation({
    mutationFn: () => consumerFinanceAuthApi.createBrowserTransfer(botId),
    onSuccess: ({ token }) => {
      const url = consumerFinanceAuthApi.browserTransferUrl(botId, token);
      const webApp = window.Telegram?.WebApp;
      if (webApp?.openLink) webApp.openLink(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    },
  });
  const logout = useMutation({
    mutationFn: () => consumerFinanceAuthApi.logout(botId),
    onSuccess: (state) => {
      queryClient.removeQueries({ queryKey: consumerFinanceKeys.root(botId) });
      queryClient.setQueryData(consumerFinanceKeys.session(botId), state);
      window.location.reload();
    },
  });
  // URL state is applied after hydration. Reading window here would make a
  // direct route such as ?screen=billing render Home on the server and Plans
  // on the first browser pass, which triggers Next's hydration overlay.
  const [screen, setScreen] = useState<ConsumerFinanceScreen>("home");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [investmentId, setInvestmentId] = useState<string | null>(null);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [openTransaction, setOpenTransaction] = useState<
    "EXPENSE" | "INCOME" | null
  >(null);
  const [actionRequestId, setActionRequestId] = useState(0);
  const [regularPaymentTarget, setRegularPaymentTarget] =
    useState<ReturnType<typeof readConsumerFinanceRegularPaymentTarget>>(null);
  const [regularPaymentTargetMalformed, setRegularPaymentTargetMalformed] =
    useState(false);
  const profile: ConsumerFinanceProfile | undefined = session.data
    ?.authenticated
    ? session.data.profile
    : undefined;
  const changeLocale = useMutation({
    mutationFn: (nextLocale: "uk" | "ru" | "en") => {
      if (!profile) throw new Error("Finance profile is unavailable");
      return consumerFinanceProfileApi.updateSettings(botId, {
        defaultCurrency: profile.defaultCurrency,
        timezone: profile.timezone,
        locale: nextLocale,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(consumerFinanceKeys.session(botId), {
        authenticated: true,
        profile: updated,
      });
    },
  });
  const rememberedLocale = useSyncExternalStore(
    subscribeToStaticBrowserState,
    () => window.localStorage.getItem(localeStorageKey) || navigator.language,
    () => undefined,
  );
  const locale = normalizeFinanceLocale(profile?.locale ?? rememberedLocale);
  const t = financeCoreCopy(locale);
  const surface = financeSurfaceForBootstrap(bootstrap.status);
  const navigate = useCallback(
    (next: ConsumerFinanceScreen) => {
      setOpenTransfer(false);
      setOpenTransaction(null);
      setAccountId(null);
      setInvestmentId(null);
      setRegularPaymentTarget(null);
      setRegularPaymentTargetMalformed(false);
      setScreen(next);
      if (surface === "browser") {
        window.history.pushState(
          { consumerFinanceScreen: next },
          "",
          consumerFinanceScreenUrl(window.location, next),
        );
      }
    },
    [surface],
  );
  const openAccount = useCallback(
    (nextAccountId: string) => {
      setOpenTransfer(false);
      setOpenTransaction(null);
      setAccountId(nextAccountId);
      setRegularPaymentTarget(null);
      setRegularPaymentTargetMalformed(false);
      setScreen("account");
      if (surface === "browser") {
        window.history.pushState(
          {
            consumerFinanceScreen: "account",
            consumerFinanceAccount: true,
          },
          "",
          consumerFinanceAccountUrl(window.location, nextAccountId),
        );
      }
    },
    [surface],
  );
  const closeAccount = useCallback(() => {
    setAccountId(null);
    if (
      surface === "browser" &&
      window.history.state?.consumerFinanceAccount === true
    ) {
      window.history.back();
      return;
    }
    setScreen("accounts");
    if (surface === "browser") {
      window.history.replaceState(
        { consumerFinanceScreen: "accounts" },
        "",
        consumerFinanceScreenUrl(window.location, "accounts"),
      );
    }
  }, [surface]);
  const openInvestment = useCallback(
    (nextInvestmentId: string) => {
      setInvestmentId(nextInvestmentId);
      setAccountId(null);
      setScreen("investment");
      if (surface === "browser")
        window.history.pushState(
          {
            consumerFinanceScreen: "investment",
            consumerFinanceInvestment: true,
          },
          "",
          consumerFinanceInvestmentUrl(window.location, nextInvestmentId),
        );
    },
    [surface],
  );
  const closeInvestment = useCallback(() => {
    setInvestmentId(null);
    if (
      surface === "browser" &&
      window.history.state?.consumerFinanceInvestment === true
    ) {
      window.history.back();
      return;
    }
    setScreen("investments");
    if (surface === "browser")
      window.history.replaceState(
        { consumerFinanceScreen: "investments" },
        "",
        consumerFinanceScreenUrl(window.location, "investments"),
      );
  }, [surface]);
  const launchAction = (action: ConsumerFinanceAction) => {
    setActionRequestId((current) => current + 1);
    if (action === "transfer") {
      navigate("transfers");
      setOpenTransfer(true);
      if (surface === "browser") {
        const url = new URL(window.location.href);
        url.searchParams.set("transfer", "1");
        window.history.replaceState(
          { consumerFinanceScreen: "transfers" },
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
      return;
    }
    navigate("transactions");
    setOpenTransaction(action === "expense" ? "EXPENSE" : "INCOME");
  };

  useEffect(() => {
    if (profile?.locale) window.localStorage.setItem(localeStorageKey, locale);
  }, [locale, localeStorageKey, profile?.locale]);

  useEffect(() => {
    const syncLocation = () => {
      setOpenTransfer(
        new URLSearchParams(window.location.search).get("transfer") === "1",
      );
      setScreen(readConsumerFinanceScreen(window.location));
      setAccountId(readConsumerFinanceAccountId(window.location));
      setInvestmentId(readConsumerFinanceInvestmentId(window.location));
      const target = readConsumerFinanceRegularPaymentTarget(window.location);
      setRegularPaymentTarget(target);
      setRegularPaymentTargetMalformed(
        hasConsumerFinanceRegularPaymentTarget(window.location) && !target,
      );
    };
    syncLocation();
    if (surface !== "browser") return;
    window.addEventListener("popstate", syncLocation);
    return () => window.removeEventListener("popstate", syncLocation);
  }, [surface]);

  const shell = (children: React.ReactNode) => {
    const contextualChildren = (
      <FinanceVisualContextProvider
        value={financeVisualContextForScreen(screen)}
      >
        {changeLocale.isError ? (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-rose-900 bg-rose-950/20 px-4 py-3 text-sm text-rose-200"
          >
            {t.languageSaveError}
          </p>
        ) : null}
        {children}
      </FinanceVisualContextProvider>
    );
    return surface === "browser" ? (
      <FinanceWebAppShell
        logoUrl={branding.logoUrl}
        screen={screen}
        copy={t}
        profile={profile}
        locale={locale}
        onLocaleChange={(nextLocale) => changeLocale.mutate(nextLocale)}
        localeChanging={changeLocale.isPending}
        localeDisabled={!profile}
        onNavigate={navigate}
        onAction={launchAction}
        onSignOut={() => logout.mutate()}
        signingOut={logout.isPending}
      >
        {contextualChildren}
      </FinanceWebAppShell>
    ) : (
      <FinanceMiniAppShell
        logoUrl={branding.logoUrl}
        screen={screen}
        copy={t}
        locale={locale}
        profile={profile}
        onLocaleChange={(nextLocale) => changeLocale.mutate(nextLocale)}
        localeChanging={changeLocale.isPending}
        localeDisabled={!profile}
        onNavigate={navigate}
        onAction={launchAction}
        onSignOut={() => logout.mutate()}
        signingOut={logout.isPending}
        openingBrowser={browserTransfer.isPending}
        browserOpenError={
          browserTransfer.isError ? t.browserOpenError : undefined
        }
        onOpenBrowser={() => browserTransfer.mutate()}
      >
        {contextualChildren}
      </FinanceMiniAppShell>
    );
  };
  if (bootstrap.status === "loading" || session.isLoading)
    return shell(<LoadingState text={t.opening} context="overview" />);
  if (bootstrap.status === "error" || session.isError)
    return shell(
      <ConsumerFinanceBootstrapError
        locale={locale}
        onRetry={() => {
          if (bootstrap.status === "ready") void session.refetch();
          else window.location.reload();
        }}
      />,
    );
  if (bootstrap.status === "browser" && session.data?.authenticated === false)
    return (
      <ConsumerFinanceLogin
        botId={botId}
        onAuthenticated={() => void session.refetch()}
      />
    );
  if (!profile)
    return shell(
      <ConsumerFinanceBootstrapError
        locale={locale}
        onRetry={() => void session.refetch()}
      />,
    );
  return shell(
    <ConsumerFinanceScreens
      botId={botId}
      profile={profile}
      screen={screen}
      onScreenChange={navigate}
      surface={surface}
      openTransfer={openTransfer}
      openTransaction={openTransaction}
      actionRequestId={actionRequestId}
      regularPaymentTarget={regularPaymentTarget}
      regularPaymentTargetMalformed={regularPaymentTargetMalformed}
      accountId={accountId}
      onAccountEdit={openAccount}
      onAccountBack={closeAccount}
      investmentId={investmentId}
      onInvestmentOpen={openInvestment}
      onInvestmentBack={closeInvestment}
    />,
  );
}
