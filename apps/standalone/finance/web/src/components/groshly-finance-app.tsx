"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GroshlyApp } from "@finance-web/groshly/main";
import { GroshlyLoadingScreen } from "@finance-web/components/groshly-loading-screen";
import { useTelegramMiniAppBootstrap } from "@consumer-finance/web/components/hooks/use-telegram-mini-app-bootstrap";
import { consumerFinanceInsightsApi } from "@consumer-finance/web/lib/api/consumer-finance-insights-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import { clearPersistedConsumerFinanceQueryCache } from "@consumer-finance/web/provider/consumer-finance-provider";

type GroshlySnapshot = Record<string, unknown>;
const GroshlyRoot = GroshlyApp as ComponentType<{
  initialData: GroshlySnapshot;
  onRefresh: () => Promise<GroshlySnapshot>;
}>;

const defaultEmojiByAccountType = {
  CASH: "💵",
  CARD: "💳",
  SAVINGS: "🐷",
  OTHER: "🏦",
} as const;

function emoji(presentation: unknown, fallback: string) {
  if (
    presentation &&
    typeof presentation === "object" &&
    "type" in presentation &&
    "value" in presentation &&
    (presentation as { type?: unknown }).type === "unicode" &&
    typeof (presentation as { value?: unknown }).value === "string"
  ) {
    return (presentation as { value: string }).value;
  }
  return fallback;
}

function groshlySnapshot({
  profile,
  dashboard,
  accounts,
  categories,
  transactions,
}: {
  profile: { defaultCurrency: string; locale: "uk" | "ru" | "en"; telegramUser: { displayName: string; username: string | null; avatarUrl: string | null }; displayNameOverride?: string | null; avatarUrl?: string | null };
  dashboard: unknown;
  accounts: Array<{ id: string; name: string; iconPresentation: unknown; type: keyof typeof defaultEmojiByAccountType; currency: string; balance: string }>;
  categories: Array<{ id: string; name: string; type: "INCOME" | "EXPENSE"; iconPresentation: unknown }>;
  transactions: { items: Array<{ id: string; accountId: string; categoryId?: string | null; type: "INCOME" | "EXPENSE"; amount: string; currency: string; occurredAt: string; description?: string | null; category?: { iconPresentation: unknown } | null }> };
}): GroshlySnapshot {
  return {
    version: 20,
    onboarded: true,
    lang: profile.locale === "ru" ? "uk" : profile.locale,
    currency: profile.defaultCurrency,
    theme: "light",
    rates: { UAH: 1, PLN: 10.7, USD: 41.8, EUR: 48.2 },
    rateSource: "api",
    profile: {
      name: profile.displayNameOverride || profile.telegramUser.displayName,
      handle: profile.telegramUser.username ? `@${profile.telegramUser.username}` : "",
      photo: profile.avatarUrl || profile.telegramUser.avatarUrl || "",
      notifications: true,
    },
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      emoji: emoji(account.iconPresentation, defaultEmojiByAccountType[account.type]),
      balance: Number(account.balance),
      currency: account.currency,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      nameEn: category.name,
      emoji: emoji(category.iconPresentation, "✨"),
      type: category.type.toLowerCase(),
    })),
    transactions: transactions.items.map((transaction) => ({
      id: transaction.id,
      type: transaction.type.toLowerCase(),
      amount: Number(transaction.amount),
      accountId: transaction.accountId,
      categoryId: transaction.categoryId || "",
      title: transaction.description || "",
      emoji: emoji(transaction.category?.iconPresentation, "🧾"),
      date: transaction.occurredAt.slice(0, 10),
      currency: transaction.currency,
    })),
    recurring: [],
    debts: [],
    investments: [],
    dashboard,
  };
}

export function GroshlyFinanceApp({ botId }: { botId: string }) {
  const queryClient = useQueryClient();
  const [cacheOwnerId, setCacheOwnerId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(`consumer-finance-cache-owner:${botId}`),
  );
  const groshlyReadKey = useMemo(
    () => [...consumerFinanceKeys.root(botId), "groshly-read-model"] as const,
    [botId],
  );
  const bootstrap = useTelegramMiniAppBootstrap();
  const financeData = useQuery({
    queryKey: groshlyReadKey,
    queryFn: () =>
      consumerFinanceInsightsApi.startup(
        botId,
        bootstrap.status === "ready" ? bootstrap.initData : undefined,
      ),
    enabled: bootstrap.status === "browser" || bootstrap.status === "ready",
    retry: false,
    // Draw a restored snapshot first, then verify it in the background on an
    // app open. That reconciles a transaction created in Telegram, the bot,
    // or another browser without bringing back a blocking loader or polling.
    refetchOnMount: "always",
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (!financeData.data?.authenticated || typeof window === "undefined") return;

    const ownerKey = `consumer-finance-cache-owner:${botId}`;
    const previousOwnerId = window.localStorage.getItem(ownerKey);
    const currentOwnerId = financeData.data.profile.id;
    if (previousOwnerId && previousOwnerId !== currentOwnerId) {
      // Never render a previous Telegram user's persisted ledger after an
      // account change on a shared device. It will be fetched anew below.
      clearPersistedConsumerFinanceQueryCache();
      queryClient.removeQueries({ queryKey: consumerFinanceKeys.root(botId) });
    }
    window.localStorage.setItem(ownerKey, currentOwnerId);
    setCacheOwnerId(currentOwnerId);
  }, [botId, financeData.data, queryClient]);
  useEffect(() => {
    if (!financeData.data?.authenticated) return;
    const reconcileAfterExternalChange = () => {
      if (document.visibilityState !== "visible") return;
      void queryClient.invalidateQueries({
        queryKey: groshlyReadKey,
        refetchType: "active",
      });
    };
    document.addEventListener("visibilitychange", reconcileAfterExternalChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        reconcileAfterExternalChange,
      );
  }, [financeData.data?.authenticated, groshlyReadKey, queryClient]);
  const snapshot = useMemo(() => {
    if (!financeData.data?.authenticated) return null;
    return groshlySnapshot(financeData.data);
  }, [financeData.data]);
  const canDrawCachedSnapshot =
    financeData.data?.authenticated === true &&
    cacheOwnerId === financeData.data.profile.id &&
    snapshot !== null;
  const refreshSnapshot = async () => {
    // Keep the previous snapshot visible during the request. Invalidating marks
    // it stale immediately, while refetch replaces it only with server truth.
    await queryClient.invalidateQueries({
      queryKey: groshlyReadKey,
      refetchType: "none",
    });
    const result = await financeData.refetch({ throwOnError: true });
    if (!result.data?.authenticated) {
      throw new Error("Finance data is unavailable");
    }
    return groshlySnapshot(result.data);
  };

  if (
    financeData.isLoading ||
    (financeData.data?.authenticated &&
      cacheOwnerId !== financeData.data.profile.id) ||
    (bootstrap.status === "loading" && !canDrawCachedSnapshot)
  ) {
    return <GroshlyLoadingScreen />;
  }
  if (!financeData.data?.authenticated) {
    return <main className="auth-screen"><div className="auth-panel"><span className="auth-panel-kicker">GROSHLY</span><h2>Sign in with Telegram</h2><p>Open Finance from the Telegram bot to securely authenticate your account.</p></div></main>;
  }
  if (!snapshot) {
    return <main className="app-shell"><div className="busy-cover"><div className="busy-card"><b>Finance data is unavailable.</b><button onClick={() => financeData.refetch()}>Retry</button></div></div></main>;
  }
  return <GroshlyRoot initialData={snapshot} onRefresh={refreshSnapshot} />;
}
