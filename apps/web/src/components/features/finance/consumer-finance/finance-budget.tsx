"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceLimit } from "@telegram-system/shared";
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Select,
} from "./ui";
import { consumerFinanceInsightsApi } from "@/lib/features/finance/consumer-finance-insights-api";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinancePlanningApi } from "@/lib/features/finance/consumer-finance-planning-api";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { type FinanceLocale } from "./i18n/core";
import { financeBudgetCopy } from "./i18n/budget";
import { localizeFinanceCategory } from "./finance-category-i18n";
export function FinanceBudget({
  botId,
  locale,
  onUpgrade,
}: {
  botId: string;
  locale: FinanceLocale;
  onUpgrade: () => void;
}) {
  const t = financeBudgetCopy(locale);
  const client = useQueryClient();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  // Dashboard, references and planning reads are independent and start together.
  const dashboard = useQuery({
    queryKey: consumerFinanceKeys.dashboard(botId),
    queryFn: () => consumerFinanceInsightsApi.dashboard(botId),
    retry: false,
  });
  const categories = useQuery({
    queryKey: consumerFinanceKeys.categories(botId),
    queryFn: () => consumerFinanceLedgerApi.categories(botId),
  });
  const smartLimits = useQuery({
    queryKey: consumerFinanceKeys.smartLimits(botId),
    queryFn: () => consumerFinancePlanningApi.smartLimits(botId),
  });
  const save = useMutation({
    mutationFn: () =>
      consumerFinancePlanningApi.saveLimit(botId, {
        categoryId,
        amount,
        currency: dashboard.data!.profile.defaultCurrency,
      }),
    onSuccess: (limit) => {
      client.setQueryData(
        consumerFinanceKeys.limits(botId),
        (items: ConsumerFinanceLimit[] | undefined) =>
          items
            ? [
                ...items.filter((item) => item.categoryId !== limit.categoryId),
                limit,
              ]
            : [limit],
      );
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
      setAmount("");
    },
  });
  if (dashboard.isLoading || categories.isLoading)
    return <LoadingState text={t.loadingFinances} />;
  if (dashboard.isError || categories.isError || !dashboard.data)
    return (
      <div className="space-y-3">
        <ErrorState text={t.financeUnavailable} />
        <Button
          onClick={() =>
            void Promise.all([dashboard.refetch(), categories.refetch()])
          }
        >
          {t.retry}
        </Button>
      </div>
    );
  const dashboardData = dashboard.data;
  const categoryRows = categories.data ?? [];
  return (
    <div className="space-y-4">
      <Card>
        <FormField label={t.expenseCategories}>
          <Select
            uiLocale={locale}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{t.selectCategory}</option>
            {categoryRows
              .filter(
                (category) =>
                  category.type === "EXPENSE" && !category.archivedAt,
              )
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {localizeFinanceCategory(category.name, category.key, locale)}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField
          label={`${t.monthlyBudget} (${dashboardData.profile.defaultCurrency})`}
        >
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>
        <Button
          className="mt-3 w-full"
          disabled={!categoryId || !amount || save.isPending}
          onClick={() => save.mutate()}
        >
          {t.saveBudget}
        </Button>
        {save.isError ? (
          <p className="mt-2 text-sm text-rose-300">{t.financeUnavailable}</p>
        ) : null}
      </Card>
      {dashboardData.limits.map((limit) => {
        const value = Math.min(100, limit.percentage);
        const categoryName = localizeFinanceCategory(
          limit.category.name,
          limit.category.key,
          locale,
        );
        return (
          <Card key={limit.id}>
            <div className="flex justify-between text-sm">
              <strong>{categoryName}</strong>
              <span className={limit.percentage > 100 ? "text-rose-300" : ""}>
                {formatMoney(limit.spent, limit.currency, "symbol")} /{" "}
                {formatMoney(limit.amount, limit.currency, "symbol")}
              </span>
            </div>
            {limit.legacyFallback ? (
              <p role="note" className="mt-2 text-xs text-amber-200">
                {limit.legacyFallback.transactionCount} {t.historicalReason}{" "}
                {limit.currency}.
              </p>
            ) : null}
            <div
              role="progressbar"
              aria-label={`${categoryName} ${t.budget}`}
              aria-valuenow={Math.round(value)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-2 h-2 rounded bg-neutral-800"
            >
              <div
                className={`h-2 rounded ${limit.percentage > 100 ? "bg-rose-400" : "bg-sky-400"}`}
                style={{ width: `${value}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              {limit.percentage > 100
                ? t.exceeded
                : `${formatMoney(limit.remaining, limit.currency, "symbol")} ${t.remaining}`}{" "}
              · {Math.round(limit.percentage)}%
            </p>
          </Card>
        );
      })}
      <Card>
        <p className="font-medium">{t.smartLimits}</p>
        {smartLimits.isLoading ? (
          <p className="mt-1 text-sm text-neutral-400">{t.checkingPro}</p>
        ) : smartLimits.isError ? (
          <div className="mt-2 space-y-2">
            <ErrorState text={t.financeUnavailable} />
            <Button variant="secondary" onClick={() => smartLimits.refetch()}>
              {t.retry}
            </Button>
          </div>
        ) : Array.isArray(smartLimits.data) ? (
          <div className="mt-2 space-y-1 text-sm text-neutral-400">
            {smartLimits.data.length ? (
              smartLimits.data.map((limit) => (
                <p key={limit.id}>
                  {localizeFinanceCategory(
                    limit.category.name,
                    limit.category.key,
                    locale,
                  )}
                  : {t.projected}{" "}
                  {formatMoney(
                    limit.forecast.projectedAmount,
                    limit.currency,
                    "symbol",
                  )}
                </p>
              ))
            ) : (
              <p>{t.addBudgetForecast}</p>
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-neutral-400">{t.smartPro}</p>
            <Button variant="secondary" onClick={onUpgrade}>
              {t.upgradePlan}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
