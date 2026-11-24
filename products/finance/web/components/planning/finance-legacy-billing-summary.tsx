"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumerBillingCatalog,
  ConsumerFinanceRenewalUpdate,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@consumer-finance/web/components/ui";
import { consumerFinancePlanningApi } from "@consumer-finance/web/lib/api/consumer-finance-planning-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financePlansCopy } from "@consumer-finance/web/components/i18n/plans";

export function FinanceLegacyBillingSummary({
  botId,
  locale,
}: {
  botId: string;
  locale: FinanceLocale;
}) {
  const t = financePlansCopy(locale);
  const [checkoutReturn] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success",
  );
  const client = useQueryClient();
  const [selectedPriceId, setSelectedPriceId] = useState("");
  const catalog = useQuery({
    queryKey: consumerFinanceKeys.billing(botId),
    queryFn: () => consumerFinancePlanningApi.billing(botId),
  });
  const updateCache = (update: ConsumerFinanceRenewalUpdate) =>
    client.setQueryData<ConsumerBillingCatalog>(
      consumerFinanceKeys.billing(botId),
      (current) =>
        current
          ? {
              ...current,
              current: {
                ...current.current,
                cancelAtPeriodEnd: update.cancelAtPeriodEnd,
              },
              subscriptions: current.subscriptions.map((item) =>
                item.id === update.id
                  ? {
                      ...item,
                      cancelAtPeriodEnd: update.cancelAtPeriodEnd,
                      currentPeriodEnd: update.currentPeriodEnd,
                    }
                  : item,
              ),
            }
          : current,
    );
  const cancel = useMutation({
    mutationFn: () => consumerFinancePlanningApi.cancelAutoRenew(botId),
    onSuccess: updateCache,
  });
  const resume = useMutation({
    mutationFn: () => consumerFinancePlanningApi.resumeAutoRenew(botId),
    onSuccess: updateCache,
  });
  const checkout = useMutation({
    mutationFn: async (priceId: string) => {
      const providers = catalog.data?.providers ?? [];
      const stripeMode = providers.some(
        (item) => item.provider === "STRIPE" && item.mode === "TEST",
      )
        ? "TEST"
        : "LIVE";
      return consumerFinancePlanningApi.checkout(
        botId,
        "STRIPE",
        priceId,
        stripeMode,
      );
    },
    onSuccess: ({ url }) => {
      const destination = new URL(url);
      if (
        destination.protocol !== "https:" &&
        !(
          destination.protocol === "http:" &&
          destination.hostname === "localhost"
        )
      )
        throw new Error("Invalid checkout destination");
      window.location.assign(destination.href);
    },
  });
  const portal = useMutation({
    mutationFn: () => consumerFinancePlanningApi.paymentPortal(botId),
    onSuccess: ({ url }) => {
      const destination = new URL(url);
      if (
        destination.protocol !== "https:" &&
        !(
          destination.protocol === "http:" &&
          destination.hostname === "localhost"
        )
      )
        throw new Error("Invalid payment portal destination");
      window.location.assign(destination.href);
    },
  });

  if (catalog.isLoading)
    return <LoadingState text={t.loadingPlan} context="plan" />;
  if (catalog.isError || !catalog.data)
    return (
      <div className="space-y-3">
        <ErrorState text={t.planLoadError} />
        <Button onClick={() => void catalog.refetch()}>{t.retry}</Button>
      </div>
    );

  const { current, subscriptions, paymentHistory } = catalog.data;
  const offers = catalog.data.plans.flatMap((plan) =>
    plan.prices
      .filter((price) => price.currency === "UAH")
      .map((price) => ({ ...price, plan })),
  );
  const stripeAvailable = catalog.data.providers.some(
    (provider) => provider.provider === "STRIPE",
  );
  const selectedPrice =
    offers.find((item) => item.id === selectedPriceId) ??
    offers.find(
      (item) => item.interval === "MONTH" && item.intervalCount === 1,
    ) ??
    offers[0];
  const manageable = subscriptions.find(
    (item) =>
      item.source === "STRIPE" && ["ACTIVE", "PAST_DUE"].includes(item.status),
  );
  const paid = current.tier !== "FREE";
  const copy =
    locale === "uk"
      ? {
          title: "Ваш доступ Finance",
          note: "Оберіть тариф і сплатіть на захищеній сторінці Stripe. Доступ увімкнеться після підтвердження платежу.",
          until: "Доступ до",
          history: "Історія платежів",
          paid: "Оплачено",
          failed: "Помилка оплати",
        }
      : locale === "ru"
        ? {
            title: "Ваш доступ Finance",
            note: "Выберите тариф и оплатите на защищённой странице Stripe. Доступ включится после подтверждения платежа.",
            until: "Доступ до",
            history: "История платежей",
            paid: "Оплачено",
            failed: "Ошибка оплаты",
          }
        : {
            title: "Your Finance access",
            note: "Choose a plan and pay on Stripe’s secure checkout page. Access starts after payment confirmation.",
            until: "Access until",
            history: "Payment history",
            paid: "Paid",
            failed: "Payment failed",
          };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">{copy.title}</h2>
        <p className="mt-2 text-sm">{paid ? "PLUS" : "FREE"}</p>
        {current.activeUntil && (
          <p className="mt-2 text-sm">
            {copy.until}{" "}
            {new Date(current.activeUntil).toLocaleDateString(
              locale === "uk" ? "uk-UA" : locale === "ru" ? "ru-RU" : "en-US",
            )}
          </p>
        )}
        <p className="mt-3 text-sm">{copy.note}</p>
        {checkoutReturn && !paid && (
          <div className="mt-3 flex flex-wrap items-center gap-2" role="status">
            <span>{t.paymentPending}</span>
            <Button
              variant="secondary"
              disabled={catalog.isFetching}
              onClick={() => {
                void catalog.refetch();
                void client.invalidateQueries({
                  queryKey: consumerFinanceKeys.entitlements(botId),
                });
              }}
            >
              {t.retry}
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">{t.available}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {offers.map((price) => {
            const { plan } = price;
            const selected = selectedPrice?.id === price.id;
            const months =
              price.interval === "YEAR"
                ? 12 * price.intervalCount
                : price.intervalCount;
            const period =
              price.interval === "DAY"
                ? new Intl.NumberFormat(locale, {
                    style: "unit",
                    unit: "day",
                    unitDisplay: "long",
                  }).format(price.intervalCount)
                : new Intl.NumberFormat(locale, {
                    style: "unit",
                    unit: "month",
                    unitDisplay: "long",
                  }).format(months);
            const amount = new Intl.NumberFormat(
              locale === "uk" ? "uk-UA" : locale === "ru" ? "ru-RU" : "en-US",
              { style: "currency", currency: price.currency },
            ).format(price.amountMinor / 100);
            return (
              <button
                key={price.id}
                type="button"
                aria-pressed={selected}
                disabled={
                  price.available === false || !plan.canPurchase || !stripeAvailable || checkout.isPending
                }
                onClick={() => setSelectedPriceId(price.id)}
                className={`rounded-xl border p-4 text-left transition ${selected ? "border-emerald-400 bg-emerald-950/30" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}
              >
                <span className="flex items-center justify-between gap-2 text-xs uppercase tracking-wider text-neutral-400">
                  <span>{plan.code === "PRO" ? "PLUS" : plan.code}</span>
                  {price.interval === "MONTH" && price.intervalCount === 1 ? (
                    <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-emerald-300">
                      {locale === "ru"
                        ? "Рекомендуем"
                        : locale === "uk"
                          ? "Рекомендуємо"
                          : "Recommended"}
                    </span>
                  ) : null}
                  {price.interval === "MONTH" && price.intervalCount === 3 ? (
                    <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-emerald-300">
                      −26%
                    </span>
                  ) : null}
                  {price.interval === "YEAR" ? (
                    <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-emerald-300">
                      −49%
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xl font-semibold">
                  {amount}
                </span>
                <span className="mt-1 block text-sm text-neutral-400">
                  {period}
                </span>
                {((price.interval === "MONTH" && price.intervalCount === 3) ||
                  price.interval === "YEAR") && (
                  <span className="mt-1 block text-xs text-neutral-400">
                    ≈{" "}
                    {new Intl.NumberFormat(
                      locale === "uk"
                        ? "uk-UA"
                        : locale === "ru"
                          ? "ru-RU"
                          : "en-US",
                      { maximumFractionDigits: 0 },
                    ).format(
                      price.amountMinor /
                        100 /
                        (price.interval === "YEAR" ? 12 : price.intervalCount),
                    )}{" "}
                    UAH/
                    {locale === "ru"
                      ? "мес."
                      : locale === "uk"
                        ? "міс."
                        : "mo."}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!offers.length && <EmptyState text={t.paidUnavailable} />}
        {selectedPrice && (
          <Button
            className="mt-4 w-full sm:w-auto"
            disabled={
              selectedPrice.available === false || !selectedPrice.plan.canPurchase ||
              !stripeAvailable ||
              checkout.isPending
            }
            onClick={() => checkout.mutate(selectedPrice.id)}
          >
            {checkout.isPending ? t.loadingPlan : t.choose} ·{" "}
            {new Intl.NumberFormat(
              locale === "uk" ? "uk-UA" : locale === "ru" ? "ru-RU" : "en-US",
              { style: "currency", currency: selectedPrice.currency },
            ).format(selectedPrice.amountMinor / 100)}
          </Button>
        )}
        {!stripeAvailable && (
          <p className="mt-3 text-sm text-neutral-400">{t.paidUnavailable}</p>
        )}
        {selectedPrice && (
          <p className="mt-3 text-sm text-neutral-400">
            {selectedPrice.interval === "DAY"
              ? t.introDisclosure
              : t.autoRenewDisclosure}
          </p>
        )}
        {(checkout.isError || portal.isError) && (
          <ErrorState text={t.checkoutError} />
        )}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">{t.billingStatus}</h2>
          {manageable && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={portal.isPending}
                onClick={() => portal.mutate()}
              >
                {t.managePaymentDetails}
              </Button>
              <Button
                variant="secondary"
                disabled={cancel.isPending || resume.isPending}
                onClick={() =>
                  void (manageable.cancelAtPeriodEnd
                    ? resume.mutate()
                    : cancel.mutate())
                }
              >
                {manageable.cancelAtPeriodEnd
                  ? t.resumeAutoRenew
                  : t.cancelAutoRenew}
              </Button>
            </div>
          )}
        </div>
        {subscriptions.length ? (
          <ul className="mt-3 space-y-2">
            {subscriptions.map((item) => (
              <li key={item.id} className="text-sm">
                {item.source} · {item.status}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState text={t.noSubscription} />
        )}
      </Card>
      <Card>
        <h2 className="font-medium">{copy.history}</h2>
        {paymentHistory.length ? (
          <ul className="mt-3 space-y-2">
            {paymentHistory.map((item) => (
              <li key={item.id} className="text-sm">
                {item.status === "SUCCEEDED" ? copy.paid : copy.failed} ·{" "}
                {item.amountMinor != null && item.currency
                  ? new Intl.NumberFormat(
                      locale === "uk"
                        ? "uk-UA"
                        : locale === "ru"
                          ? "ru-RU"
                          : "en-US",
                      { style: "currency", currency: item.currency },
                    ).format(item.amountMinor / 100)
                  : "—"}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState text={t.noPayments} />
        )}
      </Card>
      {(cancel.isError || resume.isError) && (
        <ErrorState text={t.checkoutError} />
      )}
    </div>
  );
}
