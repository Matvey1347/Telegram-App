"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { FinanceTransfers } from "./finance-transfers";
import { FinanceUltimate } from "./finance-ultimate";

export type ConsumerFinanceScreen =
  | "home"
  | "transactions"
  | "transfers"
  | "analytics"
  | "ultimate"
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
  profile,
  screen,
  onScreenChange,
  openTransfer = false,
  openTransaction = null,
}: {
  botId: string;
  profile: ConsumerFinanceProfile;
  screen: ConsumerFinanceScreen;
  onScreenChange: (screen: ConsumerFinanceScreen) => void;
  openTransfer?: boolean;
  openTransaction?: "EXPENSE" | "INCOME" | null;
}) {
  const queryClient = useQueryClient();
  const dashboard = useQuery({
    queryKey: consumerFinanceKeys.dashboard(botId),
    queryFn: () => consumerFinanceApi.dashboard(botId),
    retry: false,
    enabled: screen === "home" || screen === "budget",
  });
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceApi.accounts(botId),
    enabled:
      screen === "transactions" ||
      screen === "transfers" ||
      screen === "accounts" ||
      screen === "budget",
  });
  const categories = useQuery({
    queryKey: consumerFinanceKeys.categories(botId),
    queryFn: () => consumerFinanceApi.categories(botId),
    enabled:
      screen === "transactions" ||
      screen === "categories" ||
      screen === "budget",
  });
  const financeProfile = profile;
  const locale = normalizeFinanceLocale(financeProfile.locale);
  const t = financeCopy(locale);
  if (!financeProfile.onboardingCompletedAt)
    return (
      <FinanceOnboarding
        profile={financeProfile}
        onComplete={(input) =>
          consumerFinanceApi.updateSettings(botId, input).then((updated) => {
            queryClient.setQueryData(consumerFinanceKeys.session(botId), {
              authenticated: true,
              profile: updated,
            });
            return updated;
          })
        }
      />
    );
  if ((screen === "home" || screen === "budget") && dashboard.isLoading)
    return <LoadingState text={t.loadingFinances} />;
  if ((screen === "home" || screen === "budget") && !dashboard.data)
    return (
      <div className="space-y-3">
        <ErrorState text={t.financeUnavailable} />
        <Button onClick={() => dashboard.refetch()}>{t.retry}</Button>
      </div>
    );
  if (
    (screen === "transactions" ||
      screen === "transfers" ||
      screen === "budget") &&
    (accounts.isLoading || (screen !== "transfers" && categories.isLoading))
  )
    return <LoadingState text={t.loadingReferences} />;
  if (
    (screen === "transactions" ||
      screen === "transfers" ||
      screen === "budget") &&
    (accounts.isError || (screen !== "transfers" && categories.isError))
  )
    return (
      <div className="space-y-3">
        <ErrorState text={t.referencesUnavailable} />
        <Button
          onClick={() => {
            void accounts.refetch();
            if (screen !== "transfers") void categories.refetch();
          }}
        >
          {t.retry}
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
      {screen === "home" && (
        <>
          {dashboard.data ? (
            <FinanceDashboard
              data={dashboard.data}
              locale={locale}
              timezone={financeProfile.timezone}
              onNavigate={onScreenChange}
            />
          ) : null}
        </>
      )}
      {screen === "analytics" && (
        <FinanceAnalytics botId={botId} locale={locale} />
      )}
      {screen === "ultimate" && (
        <FinanceUltimate
          botId={botId}
          locale={locale}
          onUpgrade={() => onScreenChange("settings")}
        />
      )}
      {screen === "transactions" && (
        <FinanceTransactions
          key={openTransaction ?? "transaction-history"}
          {...context}
          locale={locale}
          timezone={financeProfile.timezone}
          initiallyOpenType={openTransaction}
        />
      )}
      {screen === "transfers" && (
        <FinanceTransfers
          key={openTransfer ? "create-transfer" : "transfer-history"}
          botId={botId}
          accounts={context.accounts}
          locale={locale}
          timezone={financeProfile.timezone}
          initiallyOpen={openTransfer}
        />
      )}
      {screen === "accounts" && (
        <FinanceAccounts
          {...context}
          defaultCurrency={financeProfile.defaultCurrency}
          locale={locale}
        />
      )}
      {screen === "budget" && (
        <FinanceBudget
          {...context}
          dashboard={dashboard.data!}
          locale={locale}
          onUpgrade={() => onScreenChange("settings")}
        />
      )}
      {screen === "categories" && (
        <FinanceCategories botId={botId} locale={locale} />
      )}
      {screen === "settings" && (
        <FinanceSettings
          botId={botId}
          profile={financeProfile}
          locale={locale}
          onCategories={() => onScreenChange("categories")}
        />
      )}
    </>
  );
}
