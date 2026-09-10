"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ConsumerFinanceAnalyticsQuery } from "@telegram-system/shared";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  Button,
  Card,
  ErrorState,
  LoadingState,
  SyncingState,
  Textarea,
} from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeAnalyticsCopy } from "./i18n/analytics";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";

export function FinanceAnalyticsAi({
  botId,
  locale,
  query,
  enabled,
  onUpgrade,
}: {
  botId: string;
  locale: FinanceLocale;
  query: ConsumerFinanceAnalyticsQuery;
  enabled: boolean;
  onUpgrade: () => void;
}) {
  const t = financeAnalyticsCopy(locale);
  const [question, setQuestion] = useState("");
  const entitlements = useQuery({
    queryKey: consumerFinanceKeys.entitlements(botId),
    queryFn: () => consumerFinanceApi.entitlements(botId),
  });
  const ask = useMutation({
    mutationFn: () =>
      consumerFinanceApi.askFinance(botId, { question, ...query }),
  });
  if (entitlements.isLoading) return <LoadingState text={t.checkingAiAccess} />;
  if (entitlements.isError || !entitlements.data)
    return (
      <Card className="space-y-3">
        <ErrorState text={t.aiAccessError} />
        <Button variant="secondary" onClick={() => entitlements.refetch()}>
          {t.retry}
        </Button>
      </Card>
    );
  const available =
    entitlements.data.capabilities.includes("FINANCE_HISTORY_QA");
  if (!available)
    return (
      <Card className="space-y-3">
        <h2 className="font-medium">{t.aiTitle}</h2>
        <p className="text-sm text-neutral-400">{t.aiUpgrade}</p>
        <Button onClick={onUpgrade}>{t.viewPlans}</Button>
      </Card>
    );
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-medium">{t.aiTitle}</h2>
        <p className="mt-1 text-xs text-neutral-400">{t.aiDisclosure}</p>
      </div>
      <Textarea
        aria-label={t.aiQuestion}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={t.aiQuestionPlaceholder}
        maxLength={500}
      />
      <Button
        disabled={!enabled || question.trim().length < 3 || ask.isPending}
        onClick={() => ask.mutate()}
      >
        {ask.isPending ? t.generatingAi : t.askAi}
      </Button>
      {ask.isPending ? <SyncingState text={t.generatingAi} compact /> : null}
      {ask.isError ? <ErrorState text={t.aiError} /> : null}
      {ask.data ? (
        <div className="rounded-lg border border-sky-800/70 bg-sky-950/20 p-3">
          <p className="text-xs font-medium text-sky-200">
            {t.generatedInterpretation}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-200">
            {ask.data.answer}
          </p>
          {ask.data.facts.length ? (
            <div className="mt-3 border-t border-sky-900 pt-2">
              <p className="text-xs text-neutral-500">{t.deterministicFacts}</p>
              <ul className="mt-1 space-y-1 text-xs">
                {ask.data.facts.map((fact) => (
                  <li key={fact.label} className="flex justify-between gap-2">
                    <span>{factLabel(fact.label, t)}</span>
                    <span className="tabular-nums">
                      {formatMoney(fact.amount, fact.currency, "symbol")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function factLabel(
  label: string,
  copy: ReturnType<typeof financeAnalyticsCopy>,
) {
  return label === "income"
    ? copy.income
    : label === "expenses"
      ? copy.expense
      : label === "netCashflow"
        ? copy.net
        : label;
}
