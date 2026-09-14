"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumerBillingCatalog,
  ConsumerFinanceRenewalUpdate,
  ConsumerFinanceTier,
} from "@telegram-system/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "./ui";
import { consumerFinancePlanningApi } from "@/lib/features/finance/consumer-finance-planning-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financePlansCopy } from "./i18n/plans";
import {
  consumerFinanceProviderLabel,
  consumerFinanceSubscriptionStatusLabel,
  consumerFinanceTierLabel,
  formatConsumerFinancePlanPrice,
  type ConsumerFinanceCatalogPlan,
  type ConsumerFinanceCheckoutOffer,
} from "./finance-consumer-billing-format";
import { FinancePlanCard } from "./finance-plan-card";
import styles from "./finance-plans.module.css";

export function FinancePlans({
  botId,
  locale,
}: {
  botId: string;
  locale: FinanceLocale;
}) {
  const t = financePlansCopy(locale);
  const client = useQueryClient();
  const [paymentPlan, setPaymentPlan] = useState<string | null>(null);
  const [mobilePlan, setMobilePlan] = useState<ConsumerFinanceTier | null>(
    null,
  );
  const catalog = useQuery({
    queryKey: consumerFinanceKeys.billing(botId),
    queryFn: () => consumerFinancePlanningApi.billing(botId),
  });
  const checkout = useMutation({
    mutationFn: (offer: ConsumerFinanceCheckoutOffer) =>
      consumerFinancePlanningApi.checkout(
        botId,
        offer.provider.provider,
        offer.price.id,
        offer.provider.mode,
      ),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const patchRenewal = (update: ConsumerFinanceRenewalUpdate) =>
    client.setQueryData<ConsumerBillingCatalog>(
      consumerFinanceKeys.billing(botId),
      (current) =>
        current
          ? {
              ...current,
              current: {
                ...current.current,
                cancelAtPeriodEnd: update.cancelAtPeriodEnd,
                activeUntil: update.currentPeriodEnd,
              },
              subscriptions: current.subscriptions.map((subscription) =>
                subscription.id === update.id
                  ? {
                      ...subscription,
                      cancelAtPeriodEnd: update.cancelAtPeriodEnd,
                      currentPeriodEnd: update.currentPeriodEnd,
                    }
                  : subscription,
              ),
            }
          : current,
    );
  const cancel = useMutation({
    mutationFn: () => consumerFinancePlanningApi.cancelAutoRenew(botId),
    onSuccess: patchRenewal,
  });
  const resume = useMutation({
    mutationFn: () => consumerFinancePlanningApi.resumeAutoRenew(botId),
    onSuccess: patchRenewal,
  });
  const portal = useMutation({
    mutationFn: () => consumerFinancePlanningApi.paymentPortal(botId),
    onSuccess: ({ url }) => window.location.assign(url),
  });

  if (catalog.isLoading)
    return <LoadingState text={t.loadingPlan} context="plan" />;
  if (catalog.isError || !catalog.data)
    return (
      <div className="w-full space-y-3">
        <ErrorState text={t.planLoadError} />
        <Button className="w-full sm:w-auto" onClick={() => catalog.refetch()}>
          {t.retry}
        </Button>
      </div>
    );

  const current = catalog.data.current;
  const paymentHistory = catalog.data.paymentHistory ?? [];
  const manageable = catalog.data.subscriptions.find(
    (subscription) =>
      subscription.source === "STRIPE" &&
      ["ACTIVE", "PAST_DUE"].includes(subscription.status),
  );
  const activeMobileTier = catalog.data.plans.some(
    (plan) => plan.code === mobilePlan,
  )
    ? mobilePlan
    : catalog.data.plans.some((plan) => plan.code === current.tier)
      ? current.tier
      : catalog.data.plans[0]?.code;
  const choosePlan = (
    plan: ConsumerFinanceCatalogPlan,
    offers: ConsumerFinanceCheckoutOffer[],
  ) => {
    if (offers.length === 1) {
      checkout.mutate(offers[0]);
      return;
    }
    setPaymentPlan(plan.code);
  };
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">{t.available}</h2>
        {catalog.data.plans.length ? (
          <>
            <div
              role="tablist"
              aria-label={t.available}
              className={styles.mobilePlanTabs}
            >
              {catalog.data.plans.map((plan) => (
                <button
                  key={plan.code}
                  id={`finance-plan-tab-${plan.code}`}
                  type="button"
                  role="tab"
                  aria-selected={activeMobileTier === plan.code}
                  aria-controls={`finance-plan-panel-${plan.code}`}
                  onClick={() => setMobilePlan(plan.code)}
                >
                  <span>
                    {consumerFinanceTierLabel(plan.code, t).replace(
                      /^Finance\s+/,
                      "",
                    )}
                  </span>
                  {plan.code === current.tier ? (
                    <small aria-hidden="true">●</small>
                  ) : null}
                </button>
              ))}
            </div>
            <div className={styles.planGrid}>
              {catalog.data.plans.map((plan) => (
                <FinancePlanCard
                  key={plan.code}
                  plan={plan}
                  providers={catalog.data.providers}
                  currentTier={current.tier}
                  locale={locale}
                  copy={t}
                  mobileActive={activeMobileTier === plan.code}
                  paymentPlan={paymentPlan}
                  checkoutPending={checkout.isPending}
                  onChoose={choosePlan}
                  onCheckout={(offer) => checkout.mutate(offer)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-3">
            <EmptyState text={t.empty} context="plan" />
          </div>
        )}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">{t.billingStatus}</h2>
          {manageable ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={
                  cancel.isPending || resume.isPending || portal.isPending
                }
                onClick={() => portal.mutate()}
              >
                {t.managePaymentDetails}
              </Button>
              <Button
                variant="secondary"
                disabled={
                  cancel.isPending || resume.isPending || portal.isPending
                }
                onClick={() =>
                  manageable.cancelAtPeriodEnd
                    ? resume.mutate()
                    : cancel.mutate()
                }
              >
                {manageable.cancelAtPeriodEnd
                  ? t.resumeAutoRenew
                  : t.cancelAutoRenew}
              </Button>
            </div>
          ) : null}
        </div>
        {catalog.data.subscriptions.length ? (
          <div className="mt-3 divide-y divide-neutral-800">
            {catalog.data.subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="flex flex-wrap justify-between gap-2 py-2 text-sm"
              >
                <span>
                  {consumerFinanceProviderLabel(subscription.source)} ·{" "}
                  {consumerFinanceSubscriptionStatusLabel(
                    subscription.status,
                    t,
                  )}
                </span>
                <span className="text-neutral-400">
                  {subscription.amountMinor != null && subscription.currency
                    ? formatConsumerFinancePlanPrice(
                        subscription.amountMinor,
                        subscription.currency,
                        locale,
                      )
                    : "—"}
                  {subscription.interval
                    ? ` / ${subscription.interval === "MONTH" ? t.month : t.year}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text={t.noSubscription} />
        )}
      </Card>
      <Card>
        <h2 className="font-medium">{t.paymentHistory}</h2>
        {paymentHistory.length ? (
          <div className="mt-3 divide-y divide-neutral-800">
            {paymentHistory.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p
                    className={
                      payment.status === "SUCCEEDED"
                        ? "text-emerald-300"
                        : "text-rose-300"
                    }
                  >
                    {payment.status === "SUCCEEDED"
                      ? t.paymentSucceeded
                      : t.paymentFailed}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {new Intl.DateTimeFormat(financeIntlLocale(locale), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(payment.occurredAt))}
                    {payment.provider
                      ? ` · ${consumerFinanceProviderLabel(payment.provider)}`
                      : ""}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums text-neutral-200">
                  {payment.amountMinor != null && payment.currency
                    ? formatConsumerFinancePlanPrice(
                        payment.amountMinor,
                        payment.currency,
                        locale,
                      )
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState text={t.noPayments} />
          </div>
        )}
      </Card>
      {checkout.isError ||
      cancel.isError ||
      resume.isError ||
      portal.isError ? (
        <ErrorState text={t.checkoutError} />
      ) : null}
    </div>
  );
}
