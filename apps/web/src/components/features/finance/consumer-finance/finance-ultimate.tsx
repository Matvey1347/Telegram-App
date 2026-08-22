"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ConsumerFinanceUltimateAnalyticsPeriod } from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { formatMoney } from "@/lib/features/finance/money";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { financeCopy, type FinanceLocale } from "./finance-i18n";

const copy = {
  en: {
    title: "Ultimate intelligence",
    overview: "Overview",
    ask: "Ask Finance",
    analytics: "Deep analytics",
    upgrade:
      "Ultimate gives you grounded history answers, forecasts and spending patterns.",
    upgradeAction: "View plans",
    balance: "Current balance",
    forecast: "Forecast",
    income: "Expected income",
    expenses: "Expected expenses",
    projected: "Projected balance",
    insights: "Useful insights",
    anomalies: "Unusual purchases",
    none: "Nothing unusual found in this period.",
    question: "Ask about your spending history",
    askAction: "Ask",
    facts: "Facts used",
    suggestions: "Try one of these",
    period: "Period",
    threeMonths: "3 months",
    sixMonths: "6 months",
    twelveMonths: "12 months",
    coverage: "Item-level data available for {available} of {total} purchases.",
    categories: "Categories",
    merchants: "Merchants",
    accounts: "Accounts",
    items: "Products",
    trend: "Trend",
    historical:
      "Older transactions without a reliable historical conversion are excluded from these totals.",
    loading: "Loading Ultimate intelligence…",
    error: "Could not load Ultimate intelligence.",
  },
  uk: {
    title: "Ultimate аналітика",
    overview: "Огляд",
    ask: "Запитати Finance",
    analytics: "Глибока аналітика",
    upgrade:
      "Ultimate надає відповіді за історією, прогноз і закономірності витрат.",
    upgradeAction: "Переглянути плани",
    balance: "Поточний баланс",
    forecast: "Прогноз",
    income: "Очікуваний дохід",
    expenses: "Очікувані витрати",
    projected: "Прогнозований баланс",
    insights: "Корисні інсайти",
    anomalies: "Незвичні покупки",
    none: "За цей період нічого незвичного не знайдено.",
    question: "Запитайте про історію витрат",
    askAction: "Запитати",
    facts: "Використані факти",
    suggestions: "Спробуйте одне з цих",
    period: "Період",
    threeMonths: "3 місяці",
    sixMonths: "6 місяців",
    twelveMonths: "12 місяців",
    coverage: "Дані за товарами доступні для {available} із {total} покупок.",
    categories: "Категорії",
    merchants: "Магазини",
    accounts: "Рахунки",
    items: "Товари",
    trend: "Динаміка",
    historical:
      "Старі операції без надійного історичного курсу виключені з цих підсумків.",
    loading: "Завантаження Ultimate аналітики…",
    error: "Не вдалося завантажити Ultimate аналітику.",
  },
  ru: {
    title: "Ultimate аналитика",
    overview: "Обзор",
    ask: "Спросить Finance",
    analytics: "Глубокая аналитика",
    upgrade:
      "Ultimate даёт ответы по истории, прогноз и закономерности расходов.",
    upgradeAction: "Посмотреть планы",
    balance: "Текущий баланс",
    forecast: "Прогноз",
    income: "Ожидаемые доходы",
    expenses: "Ожидаемые расходы",
    projected: "Прогнозный баланс",
    insights: "Полезные инсайты",
    anomalies: "Необычные покупки",
    none: "За этот период ничего необычного не найдено.",
    question: "Спросите об истории расходов",
    askAction: "Спросить",
    facts: "Использованные факты",
    suggestions: "Попробуйте один из вопросов",
    period: "Период",
    threeMonths: "3 месяца",
    sixMonths: "6 месяцев",
    twelveMonths: "12 месяцев",
    coverage: "Данные по товарам доступны для {available} из {total} покупок.",
    categories: "Категории",
    merchants: "Магазины",
    accounts: "Счета",
    items: "Товары",
    trend: "Динамика",
    historical:
      "Старые операции без надёжного исторического курса исключены из этих итогов.",
    loading: "Загрузка Ultimate аналитики…",
    error: "Не удалось загрузить Ultimate аналитику.",
  },
} as const;

export function FinanceUltimate({
  botId,
  locale,
  onUpgrade,
}: {
  botId: string;
  locale: FinanceLocale;
  onUpgrade: () => void;
}) {
  const t = copy[locale];
  const common = financeCopy(locale);
  const entitlements = useQuery({
    queryKey: consumerFinanceKeys.entitlements(botId),
    queryFn: () => consumerFinanceApi.entitlements(botId),
  });
  const isUltimate =
    entitlements.data?.capabilities.includes("DEEP_ANALYTICS") ?? false;
  const overview = useQuery({
    queryKey: consumerFinanceKeys.ultimateOverview(botId),
    queryFn: () => consumerFinanceApi.ultimateOverview(botId),
    enabled: isUltimate,
  });
  const [period, setPeriod] =
    useState<ConsumerFinanceUltimateAnalyticsPeriod>("LAST_6_MONTHS");
  const analytics = useQuery({
    queryKey: consumerFinanceKeys.ultimateAnalytics(botId, period),
    queryFn: () => consumerFinanceApi.ultimateAnalytics(botId, period),
    enabled: isUltimate,
  });
  const [question, setQuestion] = useState("");
  const ask = useMutation({
    mutationFn: () => consumerFinanceApi.askFinance(botId, { question }),
  });
  if (entitlements.isLoading) return <LoadingState text={t.loading} />;
  if (entitlements.isError || !entitlements.data)
    return (
      <Card className="space-y-3">
        <ErrorState text={t.error} />
        <Button variant="secondary" onClick={() => entitlements.refetch()}>
          {common.retry}
        </Button>
      </Card>
    );
  if (!isUltimate)
    return (
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="text-sm text-neutral-400">{t.upgrade}</p>
        <Button onClick={onUpgrade}>{t.upgradeAction}</Button>
      </Card>
    );
  if (overview.isLoading) return <LoadingState text={t.loading} />;
  if (overview.isError || !overview.data)
    return (
      <Card className="space-y-3">
        <ErrorState text={t.error} />
        <Button variant="secondary" onClick={() => overview.refetch()}>
          {common.retry}
        </Button>
      </Card>
    );
  const data = overview.data;
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={t.balance}
          value={formatMoney(
            data.balanceSummary.amount,
            data.balanceSummary.currency,
          )}
        />
        <Metric
          label={t.income}
          value={formatMoney(data.forecast.expectedIncome, data.currency)}
        />
        <Metric
          label={t.expenses}
          value={formatMoney(data.forecast.expectedExpenses, data.currency)}
        />
        <Metric
          label={t.projected}
          value={formatMoney(data.forecast.projectedBalance, data.currency)}
        />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">{t.insights}</h2>
          {data.insights.length ? (
            <div className="space-y-3">
              {data.insights.map((item) => (
                <div key={`${item.kind}-${item.title}`}>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-neutral-400">{item.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text={t.none} />
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">{t.anomalies}</h2>
          {data.anomalies.length ? (
            <div className="space-y-3">
              {data.anomalies.map((item) => (
                <div key={`${item.merchant}-${item.occurredAt}`}>
                  <p className="text-sm font-medium">
                    {item.merchant}: {formatMoney(item.amount, data.currency)}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {item.multiple}×{" "}
                    {formatMoney(item.usualAmount, data.currency)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text={t.none} />
          )}
        </Card>
      </section>
      <Card className="space-y-3">
        <h2 className="font-semibold">{t.ask}</h2>
        <Textarea
          aria-label={t.question}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t.question}
        />
        <Button
          disabled={!question.trim() || ask.isPending}
          onClick={() => ask.mutate()}
        >
          {t.askAction}
        </Button>
        {ask.isError ? <ErrorState text={t.error} /> : null}
        {ask.data ? (
          <div className="space-y-2 text-sm">
            <p>{ask.data.answer}</p>
            <p className="text-xs font-medium text-neutral-400">{t.facts}</p>
            {ask.data.facts.map((fact) => (
              <p key={fact.label}>
                {fact.label}: {formatMoney(fact.amount, fact.currency)}
              </p>
            ))}
            {ask.data.suggestedQuestions.length ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <p className="w-full text-xs font-medium text-neutral-400">
                  {t.suggestions}
                </p>
                {ask.data.suggestedQuestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="secondary"
                    onClick={() => setQuestion(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t.analytics}</h2>
          <Select
            uiLocale={locale}
            aria-label={t.period}
            value={period}
            onChange={(event) =>
              setPeriod(
                event.target.value as ConsumerFinanceUltimateAnalyticsPeriod,
              )
            }
          >
            <option value="LAST_3_MONTHS">{t.threeMonths}</option>
            <option value="LAST_6_MONTHS">{t.sixMonths}</option>
            <option value="LAST_12_MONTHS">{t.twelveMonths}</option>
          </Select>
        </div>
        {analytics.isLoading ? (
          <LoadingState text={t.loading} />
        ) : analytics.isError || !analytics.data ? (
          <div className="space-y-2">
            <ErrorState text={t.error} />
            <Button variant="secondary" onClick={() => analytics.refetch()}>
              {common.retry}
            </Button>
          </div>
        ) : (
          <Analytics data={analytics.data} labels={t} />
        )}
      </Card>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </Card>
  );
}
function Analytics({
  data,
  labels,
}: {
  data: Awaited<ReturnType<typeof consumerFinanceApi.ultimateAnalytics>>;
  labels: (typeof copy)[FinanceLocale];
}) {
  const list = (
    title: string,
    rows: Array<{ name: string; amount: string }>,
    currency = data.currency,
  ) => (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length ? (
        rows.slice(0, 5).map((row) => (
          <p key={row.name} className="text-sm text-neutral-300">
            {row.name}: {formatMoney(row.amount, currency)}
          </p>
        ))
      ) : (
        <p className="text-xs text-neutral-500">—</p>
      )}
    </div>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.legacyFallback ? (
        <p
          role="note"
          className="rounded border border-amber-700/60 bg-amber-950/30 p-2 text-xs text-amber-100 sm:col-span-2"
        >
          {labels.historical} ({data.legacyFallback.transactionCount})
        </p>
      ) : null}
      {list(labels.categories, data.categories)}
      {list(labels.merchants, data.merchants)}
      {list(labels.accounts, data.accounts)}
      {list(labels.items, data.items.rows, data.items.currency)}
      {list(
        labels.trend,
        data.trend.map((row) => ({ name: row.date, amount: row.amount })),
      )}
      <p className="text-xs text-neutral-400 sm:col-span-2">
        {labels.coverage
          .replace("{available}", String(data.items.availablePurchaseCount))
          .replace("{total}", String(data.items.totalPurchaseCount))}
      </p>
    </div>
  );
}
