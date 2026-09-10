"use client";

import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import { Button, ErrorState, LoadingState } from "./ui";
import { consumerFinanceInsightsApi } from "@/lib/features/finance/consumer-finance-insights-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { FinanceDashboard } from "./finance-dashboard";
import { financeCoreCopy, normalizeFinanceLocale } from "./i18n/core";
import type {
  ConsumerFinanceRegularPaymentTarget,
  ConsumerFinanceScreen,
  ConsumerFinanceSurface,
} from "./consumer-finance-navigation";
export type { ConsumerFinanceScreen } from "./consumer-finance-navigation";

const FinanceAccounts = lazy(() =>
  import("./finance-accounts").then((module) => ({
    default: module.FinanceAccountsScreen,
  })),
);
const FinanceAccountEditor = lazy(() =>
  import("./finance-account-editor").then((module) => ({
    default: module.FinanceAccountEditorScreen,
  })),
);
const FinanceAnalytics = lazy(() =>
  import("./finance-analytics").then((module) => ({
    default: module.FinanceAnalytics,
  })),
);
const FinanceBudget = lazy(() =>
  import("./finance-budget").then((module) => ({
    default: module.FinanceBudget,
  })),
);
const FinanceCategories = lazy(() =>
  import("./finance-categories").then((module) => ({
    default: module.FinanceCategories,
  })),
);
const FinanceOnboarding = lazy(() =>
  import("./finance-onboarding").then((module) => ({
    default: module.FinanceOnboardingScreen,
  })),
);
const FinancePlans = lazy(() =>
  import("./finance-plans").then((module) => ({
    default: module.FinancePlans,
  })),
);
const FinanceReminders = lazy(() =>
  import("./finance-reminders").then((module) => ({
    default: module.FinanceReminders,
  })),
);
const FinanceSettings = lazy(() =>
  import("./finance-settings").then((module) => ({
    default: module.FinanceSettings,
  })),
);
const FinanceAccountCenter = lazy(() =>
  import("./finance-account-center").then((module) => ({
    default: module.FinanceAccountCenter,
  })),
);
const FinanceTransactions = lazy(() =>
  import("./finance-transactions").then((module) => ({
    default: module.FinanceTransactions,
  })),
);
const FinanceTransfers = lazy(() =>
  import("./finance-transfers").then((module) => ({
    default: module.FinanceTransfers,
  })),
);
const FinanceDebts = lazy(() =>
  import("./finance-debts").then((module) => ({
    default: module.FinanceDebts,
  })),
);
const FinanceRegularPayments = lazy(() =>
  import("./finance-regular-payments").then((module) => ({
    default: module.FinanceRegularPayments,
  })),
);
const FinanceSavings = lazy(() =>
  import("./finance-savings").then((module) => ({
    default: module.FinanceSavings,
  })),
);
const FinanceInvestments = lazy(() =>
  import("./finance-investments").then((module) => ({
    default: module.FinanceInvestments,
  })),
);
const FinanceInvestmentDetail = lazy(() =>
  import("./finance-investment-detail").then((module) => ({
    default: module.FinanceInvestmentDetailScreen,
  })),
);
export function ConsumerFinanceScreens({
  botId,
  profile,
  screen,
  onScreenChange,
  surface,
  openTransfer = false,
  openTransaction = null,
  actionRequestId = 0,
  regularPaymentTarget = null,
  regularPaymentTargetMalformed = false,
  accountId = null,
  onAccountEdit = () => undefined,
  onAccountBack = () => undefined,
  investmentId = null,
  onInvestmentOpen = () => undefined,
  onInvestmentBack = () => undefined,
}: {
  botId: string;
  profile: ConsumerFinanceProfile;
  screen: ConsumerFinanceScreen;
  onScreenChange: (screen: ConsumerFinanceScreen) => void;
  surface: ConsumerFinanceSurface;
  openTransfer?: boolean;
  openTransaction?: "EXPENSE" | "INCOME" | null;
  actionRequestId?: number;
  regularPaymentTarget?: ConsumerFinanceRegularPaymentTarget | null;
  regularPaymentTargetMalformed?: boolean;
  accountId?: string | null;
  onAccountEdit?: (accountId: string) => void;
  onAccountBack?: () => void;
  investmentId?: string | null;
  onInvestmentOpen?: (investmentId: string) => void;
  onInvestmentBack?: () => void;
}) {
  const dashboard = useQuery({
    queryKey: consumerFinanceKeys.dashboard(botId),
    queryFn: () => consumerFinanceInsightsApi.dashboard(botId),
    retry: false,
    enabled: !!profile.onboardingCompletedAt && screen === "home",
  });
  const financeProfile = profile;
  const locale = normalizeFinanceLocale(financeProfile.locale);
  const t = financeCoreCopy(locale);
  if (!financeProfile.onboardingCompletedAt)
    return (
      <Suspense fallback={<LoadingState text={t.loadingReferences} />}>
        <FinanceOnboarding botId={botId} profile={financeProfile} />
      </Suspense>
    );
  if (screen === "home" && dashboard.isLoading)
    return <LoadingState text={t.loadingFinances} />;
  if (screen === "home" && !dashboard.data)
    return (
      <div className="space-y-3">
        <ErrorState text={t.financeUnavailable} />
        <Button onClick={() => dashboard.refetch()}>{t.retry}</Button>
      </div>
    );
  return (
    <Suspense fallback={<LoadingState text={t.loadingReferences} />}>
      {screen === "home" && (
        <>
          {dashboard.data ? (
            <FinanceDashboard
              data={dashboard.data}
              locale={locale}
              timezone={financeProfile.timezone}
              onNavigate={onScreenChange}
              surface={surface}
            />
          ) : null}
        </>
      )}
      {screen === "analytics" && (
        <FinanceAnalytics
          botId={botId}
          locale={locale}
          onUpgrade={() => onScreenChange("billing")}
        />
      )}
      {screen === "transactions" && (
        <FinanceTransactions
          key={`${openTransaction ?? "transaction-history"}:${actionRequestId}`}
          botId={botId}
          locale={locale}
          timezone={financeProfile.timezone}
          initiallyOpenType={openTransaction}
          surface={surface}
        />
      )}
      {screen === "transfers" && (
        <FinanceTransfers
          key={`${openTransfer ? "create-transfer" : "transfer-history"}:${actionRequestId}`}
          botId={botId}
          locale={locale}
          timezone={financeProfile.timezone}
          initiallyOpen={openTransfer}
          onCreateAccount={() => onAccountEdit("create")}
        />
      )}
      {screen === "debts" && (
        <FinanceDebts
          botId={botId}
          locale={locale}
          timezone={financeProfile.timezone}
        />
      )}
      {screen === "regular-payments" && (
        <FinanceRegularPayments
          botId={botId}
          locale={locale}
          timezone={financeProfile.timezone}
          target={regularPaymentTarget}
          targetMalformed={regularPaymentTargetMalformed}
        />
      )}
      {screen === "savings" && (
        <FinanceSavings
          botId={botId}
          locale={locale}
          defaultCurrency={financeProfile.defaultCurrency}
        />
      )}
      {screen === "investments" && (
        <FinanceInvestments
          botId={botId}
          locale={locale}
          defaultCurrency={financeProfile.defaultCurrency}
          onOpen={onInvestmentOpen}
        />
      )}
      {screen === "investment" && investmentId ? (
        <FinanceInvestmentDetail
          botId={botId}
          locale={locale}
          defaultCurrency={financeProfile.defaultCurrency}
          investmentId={investmentId}
          onBack={onInvestmentBack}
        />
      ) : null}
      {screen === "accounts" && (
        <FinanceAccounts botId={botId} locale={locale} onEdit={onAccountEdit} />
      )}
      {screen === "account" && accountId ? (
        <FinanceAccountEditor
          key={accountId}
          botId={botId}
          defaultCurrency={financeProfile.defaultCurrency}
          locale={locale}
          accountId={accountId}
          onBack={onAccountBack}
        />
      ) : null}
      {screen === "budget" && (
        <FinanceBudget
          botId={botId}
          locale={locale}
          onUpgrade={() => onScreenChange("billing")}
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
        />
      )}
      {screen === "profile" && (
        <FinanceAccountCenter
          botId={botId}
          profile={financeProfile}
          locale={locale}
        />
      )}
      {screen === "reminders" && (
        <FinanceReminders
          botId={botId}
          locale={locale}
          currency={financeProfile.defaultCurrency}
          timezone={financeProfile.timezone}
        />
      )}
      {screen === "billing" && <FinancePlans botId={botId} locale={locale} />}
    </Suspense>
  );
}
