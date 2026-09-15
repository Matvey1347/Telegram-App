"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceAnalyticsQuery } from "@telegram-system/shared";
import { Button, Card, ErrorState, LoadingState } from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { type FinanceLocale } from "./i18n/core";
import { financeAnalyticsCopy } from "./i18n/analytics";
import { FinanceAnalyticsAi } from "./finance-analytics-ai";
import { AnalyticsPresentation } from "./finance-analytics-presentation";
import { FinancePeriodSelector } from "./finance-period-selector";
import { FinanceAnalyticsSkeleton } from "./finance-analytics-skeleton";

export function FinanceAnalytics({
  botId,
  locale,
  onUpgrade,
  period = { period: "CURRENT_MONTH" },
  onPeriodChange = () => undefined,
}: {
  botId: string;
  locale: FinanceLocale;
  onUpgrade: () => void;
  period?: ConsumerFinanceAnalyticsQuery;
  onPeriodChange?: (period: ConsumerFinanceAnalyticsQuery) => void;
}) {
  const queryClient = useQueryClient();
  const t = financeAnalyticsCopy(locale);
  const query = period;
  const analytics = useQuery({
    queryKey: consumerFinanceKeys.analytics(botId, query),
    queryFn: () => consumerFinanceApi.analytics(botId, query),
    enabled: period.period !== "CUSTOM" || Boolean(period.from && period.to),
  });
  const hasResolvedAnalyticsCache = queryClient
    .getQueriesData({ queryKey: consumerFinanceKeys.analyticsRoot(botId) })
    .some(([, data]) => data !== undefined);
  const switchingPeriod = analytics.isLoading && hasResolvedAnalyticsCache;
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-medium">{t.cashflow}</h2>
        <div className="mt-3">
          <FinancePeriodSelector
            value={period}
            locale={locale}
            onChange={onPeriodChange}
          />
        </div>
        {analytics.isLoading && !switchingPeriod ? (
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
        {switchingPeriod ? (
          <FinanceAnalyticsSkeleton label={t.loadingAnalytics} />
        ) : null}
        {analytics.data && !switchingPeriod ? (
          <AnalyticsPresentation data={analytics.data} locale={locale} />
        ) : null}
      </Card>
      <FinanceAnalyticsAi
        botId={botId}
        locale={locale}
        query={query}
        enabled={
          period.period !== "CUSTOM" || Boolean(period.from && period.to)
        }
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
