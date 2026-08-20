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
  FormField,
  Input,
  Select,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { formatMoney } from "@/lib/features/finance/money";
import { consumerFinanceKeys } from "@/lib/query-keys";
export function FinanceBudget({
  botId,
  categories,
  dashboard,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  dashboard: ConsumerFinanceDashboard;
}) {
  const client = useQueryClient();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
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
  return (
    <div className="space-y-4">
      <Card>
        <FormField label="Expense category">
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Select a category</option>
            {categories
              .filter(
                (category) =>
                  category.type === "EXPENSE" && !category.archivedAt,
              )
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField
          label={`Monthly budget (${dashboard.profile.defaultCurrency})`}
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
          Save budget
        </Button>
      </Card>
      {limits.data?.map((limit) => {
        const value = Math.min(100, limit.percentage);
        return (
          <Card key={limit.id}>
            <div className="flex justify-between text-sm">
              <strong>{limit.category.name}</strong>
              <span className={limit.percentage > 100 ? "text-rose-300" : ""}>
                {formatMoney(limit.spent, limit.currency, "symbol")} /{" "}
                {formatMoney(limit.amount, limit.currency, "symbol")}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${limit.category.name} budget`}
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
                ? "Exceeded"
                : `${formatMoney(limit.remaining, limit.currency, "symbol")} remaining`}{" "}
              · {Math.round(limit.percentage)}%
            </p>
          </Card>
        );
      })}
      <Card>
        <p className="font-medium">Smart limits</p>
        {smartLimits.isLoading ? <p className="mt-1 text-sm text-neutral-400">Checking your Finance Pro access…</p> : Array.isArray(smartLimits.data) ? <div className="mt-2 space-y-1 text-sm text-neutral-400">{smartLimits.data.length ? smartLimits.data.map((limit) => <p key={limit.id}>{limit.category.name}: projected {formatMoney(limit.forecast.projectedAmount, limit.currency, "symbol")}</p>) : <p>Add a budget to receive a forecast.</p>}</div> : <p className="mt-1 text-sm text-neutral-400">Smart forecasts are a Finance Pro feature. Open More to upgrade.</p>}
      </Card>
    </div>
  );
}
