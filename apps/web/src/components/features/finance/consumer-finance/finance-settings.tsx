"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import {
  Button,
  Card,
  FormField,
  LoadingState,
  ErrorState,
  Select,
} from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  financeCopy,
  financeIntlLocale,
  supportedFinanceLocales,
  type FinanceLocale,
} from "./finance-i18n";
import { FinancePrivacy } from "./finance-privacy";
import { FinanceReminders } from "./finance-reminders";
import {
  consumerFinanceTierLabel,
  consumerFinanceUsageLabel,
  consumerFinanceUsageValue,
} from "./finance-consumer-billing-format";
import {
  financeTimezoneLabel,
  financeTimezoneOptions,
} from "./finance-timezones";

export function FinanceSettings({
  botId,
  profile,
  locale,
  onCategories,
  section = "all",
}: {
  botId: string;
  profile: ConsumerFinanceProfile;
  locale: FinanceLocale;
  onCategories: () => void;
  section?: "all" | "profile" | "reminders" | "billing";
}) {
  const t = financeCopy(locale);
  const client = useQueryClient();
  const [currency, setCurrency] = useState(profile.defaultCurrency);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [nextLocale, setNextLocale] = useState<FinanceLocale>(locale);
  const showProfile = section === "all" || section === "profile";
  const showBilling = section === "all" || section === "billing";
  const showReminders = section === "all" || section === "reminders";
  const entitlements = useQuery({
    queryKey: consumerFinanceKeys.entitlements(botId),
    queryFn: () => consumerFinanceApi.entitlements(botId),
    enabled: showBilling,
  });
  const billing = useQuery({
    queryKey: consumerFinanceKeys.billing(botId),
    queryFn: () => consumerFinanceApi.billing(botId),
    enabled:
      showBilling &&
      entitlements.data?.tier !== undefined &&
      entitlements.data.tier !== "ULTIMATE",
  });
  const targetPlanCode =
    entitlements.data?.tier === "FREE"
      ? "PRO"
      : entitlements.data?.tier === "PRO"
        ? "ULTIMATE"
        : null;
  const offer = billing.data?.plans
    .filter((plan) => plan.code === targetPlanCode)
    .flatMap((plan) =>
      plan.prices.flatMap((price) =>
        (billing.data?.providers ?? [])
          .filter(
            (provider) =>
              provider.capabilities.intervals.includes(price.interval) &&
              (provider.provider !== "TELEGRAM_STARS" ||
                price.currency === "XTR"),
          )
          .map((provider) => ({ price, provider })),
      ),
    )[0];
  const checkout = useMutation({
    mutationFn: () => {
      if (!offer) throw new Error("No checkout offer");
      return consumerFinanceApi.checkout(
        botId,
        offer.provider.provider,
        offer.price.id,
        offer.provider.mode,
      );
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
  const refreshBilling = () =>
    Promise.all([
      client.invalidateQueries({
        queryKey: consumerFinanceKeys.entitlements(botId),
      }),
      client.invalidateQueries({
        queryKey: consumerFinanceKeys.billing(botId),
      }),
    ]);
  const cancelAutoRenew = useMutation({
    mutationFn: () => consumerFinanceApi.cancelAutoRenew(botId),
    onSuccess: refreshBilling,
  });
  const resumeAutoRenew = useMutation({
    mutationFn: () => consumerFinanceApi.resumeAutoRenew(botId),
    onSuccess: refreshBilling,
  });
  const paymentPortal = useMutation({
    mutationFn: () => consumerFinanceApi.paymentPortal(botId),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
  const save = useMutation({
    mutationFn: () =>
      consumerFinanceApi.updateSettings(botId, {
        defaultCurrency: currency,
        timezone,
        locale: nextLocale,
      }),
    onSuccess: (updated) => {
      client.setQueryData(consumerFinanceKeys.session(botId), {
        authenticated: true,
        profile: updated,
      });
      void Promise.all([
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.dashboard(botId),
        }),
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.accounts(botId),
        }),
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.analyticsRoot(botId),
        }),
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.ultimateRoot(botId),
        }),
      ]);
    },
  });
  const logout = useMutation({
    mutationFn: () => consumerFinanceApi.logout(botId),
    onSuccess: (state) => {
      client.removeQueries({ queryKey: consumerFinanceKeys.root(botId) });
      client.setQueryData(consumerFinanceKeys.session(botId), state);
      window.location.reload();
    },
  });
  const entitlementData = entitlements.data;
  const activeUntil = entitlementData?.activeUntil
    ? new Intl.DateTimeFormat(financeIntlLocale(locale), {
        dateStyle: "medium",
      }).format(new Date(entitlementData.activeUntil))
    : null;
  const entitlement = entitlementData;
  return (
    <div className="space-y-4">
      {showProfile ? (
        <>
          <Card>
            <h2 className="font-medium">{t.general}</h2>
            <div className="mt-3 space-y-3">
              <FormField label={t.language}>
                <Select
                  uiLocale={locale}
                  value={nextLocale}
                  onChange={(event) =>
                    setNextLocale(event.target.value as FinanceLocale)
                  }
                >
                  {supportedFinanceLocales.map((item) => (
                    <option key={item} value={item}>
                      {item === "uk"
                        ? t.languageUkrainian
                        : item === "ru"
                          ? t.languageRussian
                          : t.languageEnglish}
                    </option>
                  ))}
                </Select>
              </FormField>
              <div>
                <FormField label={t.mainCurrency}>
                  <Select
                    uiLocale={locale}
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                  >
                    {["UAH", "USD", "EUR", "PLN"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </Select>
                </FormField>
                <p className="mt-1 text-xs text-neutral-500">
                  {t.currencyHelp}
                </p>
              </div>
              <FormField label={t.timezone}>
                <Select
                  uiLocale={locale}
                  aria-label={t.timezone}
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  {financeTimezoneOptions(timezone).map((item) => (
                    <option key={item} value={item}>
                      {financeTimezoneLabel(item)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <Button
                className="w-full"
                disabled={!currency || !timezone || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? t.saving : t.save}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
              >
                {logout.isPending ? t.signingOut : t.signOut}
              </Button>
              {save.isError || logout.isError ? (
                <p className="text-sm text-rose-300">{t.financeUnavailable}</p>
              ) : null}
            </div>
          </Card>
          <Card>
            <h2 className="font-medium">{t.categories}</h2>
            <p className="mt-1 text-sm text-neutral-400">{t.categoriesHelp}</p>
            <Button className="mt-3" variant="secondary" onClick={onCategories}>
              {t.manageCategories}
            </Button>
          </Card>
        </>
      ) : null}
      {showBilling ? (
        <Card>
          <h2 className="font-medium">{t.plan}</h2>
          {entitlements.isLoading ? (
            <LoadingState text={t.loadingPlan} />
          ) : entitlements.isError ? (
            <div className="mt-2 space-y-2">
              <ErrorState text={t.planLoadError} />
              <Button
                variant="secondary"
                onClick={() => entitlements.refetch()}
              >
                {t.retry}
              </Button>
            </div>
          ) : !entitlement ? (
            <div className="mt-2 space-y-2">
              <ErrorState text={t.planLoadError} />
              <Button
                variant="secondary"
                onClick={() => entitlements.refetch()}
              >
                {t.retry}
              </Button>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              <div>
                <p className="text-sm text-neutral-400">{t.currentPlan}</p>
                <p className="text-lg font-semibold">
                  {consumerFinanceTierLabel(entitlement.tier, t)}
                </p>
                {activeUntil ? (
                  <p className="mt-1 text-xs text-neutral-500">
                    {entitlement.cancelAtPeriodEnd
                      ? `${t.accessEnds}: ${activeUntil}`
                      : `${t.activeUntil}: ${activeUntil}`}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2" aria-label={t.usage}>
                <p className="text-sm font-medium">{t.usage}</p>
                {entitlement.usage.map((usage) => (
                  <div
                    className="flex items-center justify-between gap-3 text-sm text-neutral-300"
                    key={usage.feature}
                  >
                    <span>{consumerFinanceUsageLabel(usage, t)}</span>
                    <span className="font-medium text-white">
                      {consumerFinanceUsageValue(usage, t)}
                    </span>
                  </div>
                ))}
              </div>
              {entitlement.tier !== "ULTIMATE" ? (
                billing.isLoading ? (
                  <LoadingState text={t.loadingPlan} />
                ) : offer ? (
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-400">
                      {t.upgradeDescription}
                    </p>
                    <Button
                      disabled={checkout.isPending}
                      onClick={() => checkout.mutate()}
                    >
                      {checkout.isPending
                        ? t.openingCheckout
                        : targetPlanCode === "ULTIMATE"
                          ? t.upgradeUltimate
                          : t.upgradePlan}
                    </Button>
                    {checkout.isError ? (
                      <p className="text-sm text-rose-300">{t.checkoutError}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <ErrorState text={t.planLoadError} />
                    <Button
                      variant="secondary"
                      onClick={() => billing.refetch()}
                    >
                      {t.retry}
                    </Button>
                  </div>
                )
              ) : null}
              {entitlement.tier !== "FREE" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={paymentPortal.isPending}
                    onClick={() => paymentPortal.mutate()}
                  >
                    {t.managePaymentDetails}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={
                      cancelAutoRenew.isPending || resumeAutoRenew.isPending
                    }
                    onClick={() =>
                      entitlement.cancelAtPeriodEnd
                        ? resumeAutoRenew.mutate()
                        : cancelAutoRenew.mutate()
                    }
                  >
                    {entitlement.cancelAtPeriodEnd
                      ? t.resumeAutoRenew
                      : t.cancelAutoRenew}
                  </Button>
                  {paymentPortal.isError ||
                  cancelAutoRenew.isError ||
                  resumeAutoRenew.isError ? (
                    <p className="w-full text-sm text-rose-300">
                      {t.checkoutError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </Card>
      ) : null}
      {showReminders ? (
        <FinanceReminders
          botId={botId}
          locale={locale}
          currency={profile.defaultCurrency}
          timezone={profile.timezone}
        />
      ) : null}
      {showProfile ? <FinancePrivacy botId={botId} locale={locale} /> : null}
    </div>
  );
}
