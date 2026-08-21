"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceDashboard,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  DateInput,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Select,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { formatMoney } from "@/lib/features/finance/money";
import { consumerFinanceKeys } from "@/lib/query-keys";
import {
  financeCopy,
  localizeFinanceCategory,
  type FinanceLocale,
} from "./finance-i18n";
export function FinanceBudget({
  botId,
  categories,
  dashboard,
  locale,
  onUpgrade,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  dashboard: ConsumerFinanceDashboard;
  locale: FinanceLocale;
  onUpgrade: () => void;
}) {
  const t = financeCopy(locale);
  const client = useQueryClient();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("0");
  const [goalDate, setGoalDate] = useState("");
  const limits = useQuery({
    queryKey: consumerFinanceKeys.limits(botId),
    queryFn: () => consumerFinanceApi.limits(botId),
    initialData: dashboard.limits,
  });
  const smartLimits = useQuery({
    queryKey: [...consumerFinanceKeys.limits(botId), "smart"],
    queryFn: () => consumerFinanceApi.smartLimits(botId),
  });
  const save = useMutation({
    mutationFn: () =>
      consumerFinanceApi.saveLimit(botId, {
        categoryId,
        amount,
        currency: dashboard.profile.defaultCurrency,
      }),
    onSuccess: (limit) => {
      client.setQueryData(
        consumerFinanceKeys.limits(botId),
        (items: typeof limits.data) =>
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
  const saveGoal = useMutation({
    mutationFn: () =>
      consumerFinanceApi.saveGoal(botId, {
        name: goalName.trim(),
        targetAmount: goalTarget,
        currentAmount: goalCurrent,
        currency: dashboard.profile.defaultCurrency,
        targetDate: goalDate || undefined,
      }),
    onSuccess: (goal) => {
      client.setQueryData(consumerFinanceKeys.goal(botId), goal);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
      setGoalName("");
      setGoalTarget("");
      setGoalCurrent("0");
      setGoalDate("");
    },
  });
  const deleteGoal = useMutation({
    mutationFn: (id: string) => consumerFinanceApi.deleteGoal(botId, id),
    onSuccess: () => {
      client.setQueryData(consumerFinanceKeys.goal(botId), null);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
    },
  });
  const goal = dashboard.goal;
  return (
    <div className="space-y-4">
      <Card>
        <FormField label={t.expenseCategories}>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">{t.selectCategory}</option>
            {categories
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
          label={`${t.monthlyBudget} (${dashboard.profile.defaultCurrency})`}
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
      </Card>
      <Card>
        <h2 className="font-medium">{t.financialGoal}</h2>
        {goal ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{goal.name}</p>
                <p className="text-sm text-neutral-400">
                  {formatMoney(goal.currentAmount, goal.currency, "symbol")} /{" "}
                  {formatMoney(goal.targetAmount, goal.currency, "symbol")}
                </p>
              </div>
              <Button
                variant="danger"
                disabled={deleteGoal.isPending}
                onClick={() => deleteGoal.mutate(goal.id)}
              >
                {t.deleteGoal}
              </Button>
            </div>
            <div
              role="progressbar"
              aria-label={goal.name}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(
                100,
                Math.round(
                  (Number(goal.currentAmount) / Number(goal.targetAmount)) *
                    100,
                ),
              )}
              className="h-2 rounded bg-neutral-800"
            >
              <div
                className="h-2 rounded bg-emerald-400"
                style={{
                  width: `${Math.min(100, (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <EmptyState text={t.noGoal} />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t.goalName}>
                <Input
                  value={goalName}
                  onChange={(event) => setGoalName(event.target.value)}
                />
              </FormField>
              <FormField
                label={`${t.goalTarget} (${dashboard.profile.defaultCurrency})`}
              >
                <Input
                  inputMode="decimal"
                  value={goalTarget}
                  onChange={(event) => setGoalTarget(event.target.value)}
                />
              </FormField>
              <FormField label={t.goalCurrent}>
                <Input
                  inputMode="decimal"
                  value={goalCurrent}
                  onChange={(event) => setGoalCurrent(event.target.value)}
                />
              </FormField>
              <FormField label={t.goalTargetDate}>
                <DateInput
                  lang={locale}
                  value={goalDate}
                  onChange={(event) => setGoalDate(event.target.value)}
                />
              </FormField>
            </div>
            <Button
              disabled={
                !goalName.trim() ||
                Number(goalTarget) <= 0 ||
                Number(goalCurrent) < 0 ||
                saveGoal.isPending
              }
              onClick={() => saveGoal.mutate()}
            >
              {saveGoal.isPending ? t.saving : t.saveGoal}
            </Button>
          </div>
        )}
        {saveGoal.isError ? (
          <p className="mt-2 text-sm text-rose-300">{t.goalSaveError}</p>
        ) : null}
        {deleteGoal.isError ? (
          <p className="mt-2 text-sm text-rose-300">{t.goalDeleteError}</p>
        ) : null}
      </Card>
      {limits.data?.map((limit) => {
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
