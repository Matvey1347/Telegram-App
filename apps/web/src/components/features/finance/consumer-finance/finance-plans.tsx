"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumerBillingCatalog,
  ConsumerFinanceRenewalUpdate,
} from "@telegram-system/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "./ui";
import { consumerFinancePlanningApi } from "@/lib/features/finance/consumer-finance-planning-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financePlansCopy } from "./i18n/plans";
import {
  consumerFinanceFeatureLabel,
  consumerFinanceOffersForPlan,
  consumerFinanceProviderLabel,
  consumerFinanceSubscriptionStatusLabel,
  consumerFinanceTierLabel,
  formatConsumerFinancePlanPrice,
  type ConsumerFinanceCheckoutOffer,
} from "./finance-consumer-billing-format";
import { FinancePlanVisual } from "./finance-plan-visual";

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
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">{t.available}</h2>
        {catalog.data.plans.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {catalog.data.plans.map((plan) => {
              const selected = plan.code === current.tier;
              const featured = plan.code === "PRO";
              const offers = consumerFinanceOffersForPlan(
                plan,
                catalog.data.providers,
              );
              const positioning =
                plan.code === "PRO"
                  ? t.proPositioning
                  : plan.code === "ULTIMATE"
                    ? t.ultimatePositioning
                    : t.freePositioning;
              const choosePlan = () => {
                if (offers.length === 1) {
                  checkout.mutate(offers[0]);
                  return;
                }
                setPaymentPlan(plan.code);
              };
              return (
                <section
                  key={plan.code}
                  data-finance-plan={plan.code}
                  data-featured={featured || undefined}
                  className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border p-3.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(0,0,0,0.24)] motion-reduce:transform-none ${featured ? "border-sky-500 bg-sky-950/20 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-sky-400" : selected ? "border-sky-700 bg-sky-950/15" : plan.code === "ULTIMATE" ? "border-violet-800/80 bg-violet-950/10 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-violet-400" : "border-neutral-800 bg-neutral-950/50 hover:border-neutral-700"}`}
                >
                  <FinancePlanVisual tier={plan.code} />
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">
                        {consumerFinanceTierLabel(plan.code, t)}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-neutral-400">
                        {positioning}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {featured ? (
                        <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-1 text-xs font-medium text-sky-200">
                          {t.mostPopular}
                        </span>
                      ) : null}
                      {selected ? (
                        <span className="rounded-full bg-neutral-800 px-2 py-1 text-xs text-neutral-200">
                          {t.currentPlan}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {plan.prices.length ? (
                    <div className="mt-3 space-y-2.5 border-t border-neutral-800 pt-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        {plan.prices.map((price) => (
                          <p
                            key={price.id}
                            className="font-medium tabular-nums"
                          >
                            {formatConsumerFinancePlanPrice(
                              price.amountMinor,
                              price.currency,
                              locale,
                            )}{" "}
                            / {price.interval === "MONTH" ? t.month : t.year}
                          </p>
                        ))}
                      </div>
                      {selected ? null : plan.canPurchase && offers.length ? (
                        <>
                          <Button
                            className="min-h-11 w-full"
                            disabled={checkout.isPending}
                            onClick={choosePlan}
                          >
                            {t.choose}
                          </Button>
                          {paymentPlan === plan.code && offers.length > 1 ? (
                            <div
                              role="group"
                              aria-label={t.choosePaymentMethod}
                              className="space-y-2 rounded-xl border border-sky-900/70 bg-neutral-950/70 p-3"
                            >
                              <p className="text-xs font-medium text-neutral-300">
                                {t.choosePaymentMethod}
                              </p>
                              <div className="grid gap-2">
                                {offers.map((offer) => (
                                  <button
                                    key={`${offer.price.id}-${offer.provider.provider}-${offer.provider.mode}`}
                                    type="button"
                                    disabled={checkout.isPending}
                                    onClick={() => checkout.mutate(offer)}
                                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-left text-sm outline-none transition hover:border-sky-600 hover:bg-sky-950/30 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50"
                                  >
                                    <span className="font-medium text-neutral-100">
                                      {offer.provider.provider ===
                                      "TELEGRAM_STARS"
                                        ? t.payWithTelegramStars
                                        : t.payByCard}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-neutral-300">
                                      {formatConsumerFinancePlanPrice(
                                        offer.price.amountMinor,
                                        offer.price.currency,
                                        locale,
                                      )}{" "}
                                      /{" "}
                                      {offer.price.interval === "MONTH"
                                        ? t.month
                                        : t.year}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-xs text-neutral-500">
                          {t.unavailable}
                        </p>
                      )}
                    </div>
                  ) : plan.code === "FREE" ? (
                    <p className="mt-3 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
                      {t.included}
                    </p>
                  ) : (
                    <p className="mt-4 text-sm text-neutral-500">
                      {t.unavailable}
                    </p>
                  )}
                  <ul className="mt-3 grid flex-1 gap-x-3 gap-y-1.5 border-t border-neutral-800/80 pt-3 text-xs leading-5 text-neutral-300 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex min-w-0 gap-2">
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-emerald-300"
                        >
                          ✓
                        </span>
                        <span>
                          {consumerFinanceFeatureLabel(feature, plan, t)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
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
