"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceProfile,
} from "@telegram-system/shared";
import { Button, ErrorState, LoadingState } from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
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
import type {
  ConsumerFinanceAction,
  ConsumerFinanceSurface,
} from "./consumer-finance-navigation";

export type ConsumerFinanceScreen =
  | "home"
  | "transactions"
  | "transfers"
  | "analytics"
  | "ultimate"
  | "accounts"
  | "settings"
  | "categories"
  | "reminders"
  | "billing"
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
  onAction,
  surface,
  openTransfer = false,
  openTransaction = null,
}: {
  botId: string;
  profile: ConsumerFinanceProfile;
  screen: ConsumerFinanceScreen;
  onScreenChange: (screen: ConsumerFinanceScreen) => void;
  onAction: (action: ConsumerFinanceAction) => void;
  surface: ConsumerFinanceSurface;
  openTransfer?: boolean;
  openTransaction?: "EXPENSE" | "INCOME" | null;
}) {
  const queryClient = useQueryClient();
  const dashboard = useQuery({
    queryKey: consumerFinanceKeys.dashboard(botId),
    queryFn: () => consumerFinanceApi.dashboard(botId),
    retry: false,
    enabled:
      !!profile.onboardingCompletedAt &&
      (screen === "home" || screen === "budget"),
  });
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceApi.accounts(botId),
    enabled:
      screen === "transactions" ||
      screen === "transfers" ||
      screen === "accounts",
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
  const needsAccounts =
    screen === "transactions" ||
    screen === "transfers" ||
    screen === "accounts";
  const needsCategories = screen === "transactions" || screen === "budget";
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
    (needsAccounts && accounts.isLoading) ||
    (needsCategories && categories.isLoading)
  )
    return <LoadingState text={t.loadingReferences} />;
  if (
    (needsAccounts && accounts.isError) ||
    (needsCategories && categories.isError)
  )
    return (
      <div className="space-y-3">
        <ErrorState text={t.referencesUnavailable} />
        <Button
          onClick={() => {
            if (needsAccounts) void accounts.refetch();
            if (needsCategories) void categories.refetch();
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
              onAction={onAction}
              surface={surface}
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
          onUpgrade={() =>
            onScreenChange(surface === "browser" ? "billing" : "settings")
          }
        />
      )}
      {screen === "transactions" && (
        <FinanceTransactions
          key={openTransaction ?? "transaction-history"}
          {...context}
          locale={locale}
          timezone={financeProfile.timezone}
          initiallyOpenType={openTransaction}
          surface={surface}
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
          botId={botId}
          categories={context.categories}
          dashboard={dashboard.data!}
          locale={locale}
          onUpgrade={() =>
            onScreenChange(surface === "browser" ? "billing" : "settings")
          }
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
          section={surface === "browser" ? "profile" : "all"}
        />
      )}
      {screen === "reminders" && (
        <FinanceSettings
          botId={botId}
          profile={financeProfile}
          locale={locale}
          onCategories={() => onScreenChange("categories")}
          section="reminders"
        />
      )}
      {screen === "billing" && (
        <FinanceSettings
          botId={botId}
          profile={financeProfile}
          locale={locale}
          onCategories={() => onScreenChange("categories")}
          section="billing"
        />
      )}
    </>
  );
}
