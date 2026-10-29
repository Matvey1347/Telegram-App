"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsumerBillingCatalog, ConsumerFinanceRenewalUpdate } from "@telegram-system/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "@consumer-finance/web/components/ui";
import { consumerFinancePlanningApi } from "@consumer-finance/web/lib/api/consumer-finance-planning-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financePlansCopy } from "@consumer-finance/web/components/i18n/plans";

/** Read-only legacy account view while the independent Finance billing rollout is pending. */
export function FinanceLegacyBillingSummary({ botId, locale }: { botId: string; locale: FinanceLocale }) {
  const t = financePlansCopy(locale);
  const client = useQueryClient();
  const catalog = useQuery({
    queryKey: consumerFinanceKeys.billing(botId),
    queryFn: () => consumerFinancePlanningApi.billing(botId),
  });
  const updateCache = (update: ConsumerFinanceRenewalUpdate) => client.setQueryData<ConsumerBillingCatalog>(
    consumerFinanceKeys.billing(botId),
    current => current ? {
      ...current,
      current: { ...current.current, cancelAtPeriodEnd: update.cancelAtPeriodEnd, activeUntil: update.currentPeriodEnd },
      subscriptions: current.subscriptions.map(item => item.id === update.id ? { ...item, cancelAtPeriodEnd: update.cancelAtPeriodEnd, currentPeriodEnd: update.currentPeriodEnd } : item),
    } : current,
  );
  const cancel = useMutation({ mutationFn: () => consumerFinancePlanningApi.cancelAutoRenew(botId), onSuccess: updateCache });
  const resume = useMutation({ mutationFn: () => consumerFinancePlanningApi.resumeAutoRenew(botId), onSuccess: updateCache });

  if (catalog.isLoading) return <LoadingState text={t.loadingPlan} context="plan" />;
  if (catalog.isError || !catalog.data) return <div className="space-y-3"><ErrorState text={t.planLoadError} /><Button onClick={() => void catalog.refetch()}>{t.retry}</Button></div>;

  const { current, subscriptions, paymentHistory } = catalog.data;
  const manageable = subscriptions.find(item => item.source === "STRIPE" && ["ACTIVE", "PAST_DUE"].includes(item.status));
  const paid = current.tier !== "FREE";
  const copy = locale === "uk" ? {
    title: "Ваш доступ Finance",
    note: "Нові покупки у старому Finance Web закриті. Підписку та історію можна переглянути тут. Питання щодо оплати:",
    until: "Доступ до",
    history: "Історія платежів",
    paid: "Оплачено",
    failed: "Помилка оплати",
  } : locale === "ru" ? {
    title: "Ваш доступ Finance",
    note: "Новые покупки в старом Finance Web закрыты. Подписку и историю можно посмотреть здесь. По вопросам оплаты:",
    until: "Доступ до",
    history: "История платежей",
    paid: "Оплачено",
    failed: "Ошибка оплаты",
  } : {
    title: "Your Finance access",
    note: "New purchases are closed in the old Finance Web. You can review your subscription and history here. For payment help:",
    until: "Access until",
    history: "Payment history",
    paid: "Paid",
    failed: "Payment failed",
  };

  return <div className="space-y-4">
    <Card>
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="mt-2 text-sm">{paid ? "PLUS" : "FREE"}</p>
      {current.activeUntil && <p className="mt-2 text-sm">{copy.until} {new Date(current.activeUntil).toLocaleDateString(locale === "uk" ? "uk-UA" : locale === "ru" ? "ru-RU" : "en-US")}</p>}
      <p className="mt-3 text-sm">{copy.note} <a href="mailto:matveybogdantg@gmail.com" className="underline">matveybogdantg@gmail.com</a></p>
    </Card>
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{t.billingStatus}</h2>
        {manageable && <Button variant="secondary" disabled={cancel.isPending || resume.isPending} onClick={() => void (manageable.cancelAtPeriodEnd ? resume.mutate() : cancel.mutate())}>
          {manageable.cancelAtPeriodEnd ? t.resumeAutoRenew : t.cancelAutoRenew}
        </Button>}
      </div>
      {subscriptions.length ? <ul className="mt-3 space-y-2">{subscriptions.map(item => <li key={item.id} className="text-sm">{item.source} · {item.status}</li>)}</ul> : <EmptyState text={t.noSubscription} />}
    </Card>
    <Card>
      <h2 className="font-medium">{copy.history}</h2>
      {paymentHistory.length ? <ul className="mt-3 space-y-2">{paymentHistory.map(item => <li key={item.id} className="text-sm">{item.status === "SUCCEEDED" ? copy.paid : copy.failed} · {item.amountMinor != null && item.currency ? new Intl.NumberFormat(locale === "uk" ? "uk-UA" : locale === "ru" ? "ru-RU" : "en-US", { style: "currency", currency: item.currency }).format(item.amountMinor / 100) : "—"}</li>)}</ul> : <EmptyState text={t.noPayments} />}
    </Card>
    {(cancel.isError || resume.isError) && <ErrorState text={t.checkoutError} />}
  </div>;
}
