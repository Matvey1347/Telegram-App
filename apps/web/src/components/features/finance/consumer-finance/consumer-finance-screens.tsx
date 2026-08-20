"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceProfile,
} from "@telegram-system/shared";
import { Button, ErrorState, LoadingState } from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { FinanceAccounts } from "./finance-accounts";
import { FinanceAnalytics } from "./finance-analytics";
import { FinanceBudget } from "./finance-budget";
import { FinanceCategories } from "./finance-categories";
import { FinanceDashboard } from "./finance-dashboard";
import { financeCopy, normalizeFinanceLocale } from "./finance-i18n";
import { FinanceOnboarding } from "./finance-onboarding";
import { FinanceSettings } from "./finance-settings";
import { FinanceTransactions } from "./finance-transactions";

export type ConsumerFinanceScreen =
  | "home"
  | "transactions"
  | "analytics"
  | "accounts"
  | "settings"
  | "categories"
  /** Retained as a direct URL while budget remains a secondary workflow. */
  | "budget";
export type ConsumerFinanceContext = {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
};

export function ConsumerFinanceScreens({
  botId,
  screen,
  onScreenChange,
  openTransfer = false,
}: {
  botId: string;
  screen: ConsumerFinanceScreen;
  onScreenChange: (screen: ConsumerFinanceScreen) => void;
  openTransfer?: boolean;
}) {
  const profile = useQuery({
    queryKey: consumerFinanceKeys.settings(botId),
    queryFn: () => consumerFinanceApi.session(botId),
    retry: false,
  });
  const dashboard = useQuery({
    queryKey: consumerFinanceKeys.dashboard(botId),
    queryFn: () => consumerFinanceApi.dashboard(botId),
    retry: false,
    enabled: screen === "home" || screen === "budget",
  });
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceApi.accounts(botId),
    enabled: screen === "transactions" || screen === "accounts" || screen === "budget",
  });
  const categories = useQuery({
    queryKey: consumerFinanceKeys.categories(botId),
    queryFn: () => consumerFinanceApi.categories(botId),
    enabled: screen === "transactions" || screen === "categories" || screen === "budget",
  });
  const financeProfile = (profile.data as { profile: ConsumerFinanceProfile } | undefined)?.profile;
  const locale = normalizeFinanceLocale(financeProfile?.locale);
  const t = financeCopy(locale);
  if (profile.isLoading) return <LoadingState text={t.loadingFinances} />;
  if (!financeProfile)
    return (
      <div className="space-y-3">
        <ErrorState text={t.financeUnavailable} />
        <Button onClick={() => profile.refetch()}>{t.retry}</Button>
      </div>
    );
  if (!financeProfile.onboardingCompletedAt)
    return <FinanceOnboarding profile={financeProfile} onComplete={(input) => consumerFinanceApi.updateSettings(botId, input).then((updated) => {
      void profile.refetch();
      return updated;
    })} />;
  if ((screen === "home" || screen === "budget") && dashboard.isLoading)
    return <LoadingState text={t.loadingFinances} />;
  if ((screen === "home" || screen === "budget") && !dashboard.data)
    return <div className="space-y-3"><ErrorState text={t.financeUnavailable} /><Button onClick={() => dashboard.refetch()}>{t.retry}</Button></div>;
  if ((screen === "transactions" || screen === "budget") && (accounts.isLoading || categories.isLoading))
    return <LoadingState text="Loading accounts and categories…" />;
  if ((screen === "transactions" || screen === "budget") && (accounts.isError || categories.isError))
    return (
      <div className="space-y-3">
        <ErrorState text="Accounts or categories could not be loaded." />
        <Button
          onClick={() => {
            void accounts.refetch();
            void categories.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  const context: ConsumerFinanceContext = {
    botId,
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
  };
  return (
    <>
      <header className="mb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">
          Personal Finance
        </p>
        <h1 className="text-2xl font-semibold">
          {screen === "home"
            ? t.overview
            : screen === "budget"
              ? "Budget"
              : screen === "categories"
                ? t.categories
                : t[screen]}
        </h1>
      </header>
      {screen === "home" && (
        <>
          {dashboard.data ? <FinanceDashboard data={dashboard.data} onNavigate={onScreenChange} /> : null}
        </>
      )}
      {screen === "analytics" && <FinanceAnalytics botId={botId} />}
      {screen === "transactions" && (
        <FinanceTransactions
          {...context}
          openTransfer={openTransfer}
        />
      )}
      {screen === "accounts" && (
        <FinanceAccounts
          {...context}
          defaultCurrency={financeProfile.defaultCurrency}
        />
      )}
      {screen === "budget" && (
        <FinanceBudget {...context} dashboard={dashboard.data!} />
      )}
      {screen === "categories" && <FinanceCategories botId={botId} locale={locale} />}
      {screen === "settings" && <FinanceSettings botId={botId} profile={financeProfile} locale={locale} onCategories={() => onScreenChange("categories")} />}
    </>
  );
}
