"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ConsumerFinanceAnalyticsPeriod,
  ConsumerFinanceAnalyticsQuery,
} from "@telegram-system/shared";
import { Button, Card, ErrorState, Input, LoadingState } from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { type FinanceLocale } from "./i18n/core";
import { financeAnalyticsCopy } from "./i18n/analytics";
import { FinanceAnalyticsAi } from "./finance-analytics-ai";
import { AnalyticsPresentation } from "./finance-analytics-presentation";

export function FinanceAnalytics({
  botId,
  locale,
  onUpgrade,
}: {
  botId: string;
  locale: FinanceLocale;
  onUpgrade: () => void;
}) {
  const t = financeAnalyticsCopy(locale);
  const periods: Array<{
    value: ConsumerFinanceAnalyticsPeriod;
    label: string;
  }> = [
    { value: "CURRENT_MONTH", label: t.currentMonth },
    { value: "PREVIOUS_MONTH", label: t.previousMonth },
    { value: "LAST_3_MONTHS", label: t.lastThreeMonths },
    { value: "CUSTOM", label: t.customPeriod },
  ];
  const [period, setPeriod] =
    useState<ConsumerFinanceAnalyticsPeriod>("CURRENT_MONTH");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query: ConsumerFinanceAnalyticsQuery =
    period === "CUSTOM" ? { period, from, to } : { period };
  const analytics = useQuery({
    queryKey: consumerFinanceKeys.analytics(botId, query),
    queryFn: () => consumerFinanceApi.analytics(botId, query),
    enabled: period !== "CUSTOM" || Boolean(from && to),
  });
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-medium">{t.cashflow}</h2>
        <div
          className="mt-2 flex flex-wrap gap-1"
          aria-label={t.analyticsPeriod}
        >
          {periods.map((item) => (
            <Button
              key={item.value}
              variant={period === item.value ? "primary" : "secondary"}
              onClick={() => setPeriod(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {period === "CUSTOM" ? (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              aria-label={t.analyticsStart}
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <Input
              aria-label={t.analyticsEnd}
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        ) : null}
        {analytics.isLoading ? (
          <LoadingState text={t.loadingAnalytics} />
        ) : null}
        {analytics.isError ? (
          <div className="mt-3 space-y-2">
            <ErrorState text={t.analyticsError} />
            <Button variant="secondary" onClick={() => analytics.refetch()}>
              {t.retry}
            </Button>
          </div>
        ) : null}
        {analytics.data ? (
          <AnalyticsPresentation data={analytics.data} locale={locale} />
        ) : null}
      </Card>
      <FinanceAnalyticsAi
        botId={botId}
        locale={locale}
        query={query}
        enabled={period !== "CUSTOM" || Boolean(from && to)}
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
