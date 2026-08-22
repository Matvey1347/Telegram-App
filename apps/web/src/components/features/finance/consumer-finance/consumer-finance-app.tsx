"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoadingState } from "./ui";
import {
  ConsumerFinanceScreens,
  type ConsumerFinanceScreen,
} from "./consumer-finance-screens";
import { useTelegramMiniAppBootstrap } from "./use-telegram-mini-app-bootstrap";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  ConsumerFinanceBootstrapError,
  ConsumerFinanceLogin,
} from "./consumer-finance-login";
import type {
  ConsumerFinanceProfile,
  ConsumerFinanceSessionState,
} from "@telegram-system/shared";
import { financeCopy, normalizeFinanceLocale } from "./finance-i18n";
import { FinanceMiniAppShell } from "./finance-mini-app-shell";
import { FinanceWebAppShell } from "./finance-web-app-shell";
import {
  consumerFinanceScreenUrl,
  financeSurfaceForBootstrap,
  readConsumerFinanceScreen,
  type ConsumerFinanceAction,
} from "./consumer-finance-navigation";
import { useFinanceBotBranding } from "./use-finance-bot-branding";

const subscribeToStaticBrowserState = () => () => undefined;

export function ConsumerFinanceApp({ botId }: { botId: string }) {
  const branding = useFinanceBotBranding(botId);
  const localeStorageKey = `consumer-finance-locale:${botId}`;
  const bootstrap = useTelegramMiniAppBootstrap();
  const session = useQuery({
    queryKey: consumerFinanceKeys.session(botId),
    queryFn: async (): Promise<ConsumerFinanceSessionState> => {
      const existing = await consumerFinanceApi.session(botId);
      if (existing.authenticated || bootstrap.status !== "ready") {
        return existing;
      }
      return consumerFinanceApi.auth(botId, bootstrap.initData);
    },
    enabled: bootstrap.status === "browser" || bootstrap.status === "ready",
    retry: false,
    refetchOnReconnect: false,
  });
  const browserTransfer = useMutation({
    mutationFn: () => consumerFinanceApi.createBrowserTransfer(botId),
    onSuccess: ({ token }) => {
      const url = consumerFinanceApi.browserTransferUrl(botId, token);
      const webApp = window.Telegram?.WebApp;
      if (webApp?.openLink) webApp.openLink(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    },
  });
  const [screen, setScreen] = useState<ConsumerFinanceScreen>(() =>
    typeof window === "undefined"
      ? "home"
      : readConsumerFinanceScreen(window.location),
  );
  const [openTransfer, setOpenTransfer] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("transfer") === "1",
  );
  const [openTransaction, setOpenTransaction] = useState<
    "EXPENSE" | "INCOME" | null
  >(null);
  const profile: ConsumerFinanceProfile | undefined = session.data
    ?.authenticated
    ? session.data.profile
    : undefined;
  const rememberedLocale = useSyncExternalStore(
    subscribeToStaticBrowserState,
    () => window.localStorage.getItem(localeStorageKey) || navigator.language,
    () => undefined,
  );
  const locale = normalizeFinanceLocale(profile?.locale ?? rememberedLocale);
  const t = financeCopy(locale);
  const surface = financeSurfaceForBootstrap(bootstrap.status);
  const navigate = useCallback(
    (next: ConsumerFinanceScreen) => {
      setOpenTransfer(false);
      setOpenTransaction(null);
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
  const launchAction = (action: ConsumerFinanceAction) => {
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
    if (surface !== "browser") return;
    const onPopState = () => {
      setOpenTransfer(
        new URLSearchParams(window.location.search).get("transfer") === "1",
      );
      setScreen(readConsumerFinanceScreen(window.location));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [surface]);

  const shell = (children: React.ReactNode) =>
    surface === "browser" ? (
      <FinanceWebAppShell
        logoUrl={branding.logoUrl}
        screen={screen}
        copy={t}
        profile={profile}
        onNavigate={navigate}
        onAction={launchAction}
      >
        {children}
      </FinanceWebAppShell>
    ) : (
      <FinanceMiniAppShell
        logoUrl={branding.logoUrl}
        screen={screen}
        copy={t}
        onNavigate={navigate}
        onAction={launchAction}
        openingBrowser={browserTransfer.isPending}
        browserOpenError={
          browserTransfer.isError ? t.browserOpenError : undefined
        }
        onOpenBrowser={() => browserTransfer.mutate()}
      >
        {children}
      </FinanceMiniAppShell>
    );
  if (bootstrap.status === "loading")
    return (
      <main
        data-finance-shell="bootstrap"
        className="flex min-h-dvh items-center justify-center bg-neutral-950 px-6 text-neutral-100"
      >
        <LoadingState text={t.opening} />
      </main>
    );
  if (session.isLoading) return shell(<LoadingState text={t.opening} />);
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
      onAction={launchAction}
      surface={surface}
      openTransfer={openTransfer}
      openTransaction={openTransaction}
    />,
  );
}
