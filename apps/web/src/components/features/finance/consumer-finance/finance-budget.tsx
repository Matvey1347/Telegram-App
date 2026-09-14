"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinanceLimit } from "@telegram-system/shared";
import {
  Button,
  Card,
  ErrorState,
  FinanceCardActionsMenu,
  FormField,
  Input,
  LoadingState,
  Select,
  Modal,
} from "./ui";
import { consumerFinanceInsightsApi } from "@/lib/features/finance/consumer-finance-insights-api";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinancePlanningApi } from "@/lib/features/finance/consumer-finance-planning-api";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { type FinanceLocale } from "./i18n/core";
import { financeBudgetCopy } from "./i18n/budget";
import { localizeFinanceCategory } from "./finance-category-i18n";
import { FinancePlanPromotion } from "./finance-plan-promotion";
import { IconAvatar } from "./ui/finance-icon-avatar";
import { Pencil, Trash2 } from "lucide-react";
import { FinanceConfirmModal } from "./finance-confirm-modal";
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<ConsumerFinanceLimit | null>(null);
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
      setCategoryId("");
      setEditorOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      consumerFinancePlanningApi.deleteLimit(botId, id),
    onSuccess: (_result, id) => {
      client.setQueryData(
        consumerFinanceKeys.limits(botId),
        (items: ConsumerFinanceLimit[] | undefined) =>
          items?.filter((item) => item.id !== id),
      );
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
      setDeleting(null);
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
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setCategoryId("");
            setAmount("");
            setEditorOpen(true);
          }}
        >
          {t.addBudget}
        </Button>
      </div>
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        closeLabel={t.close}
        title={categoryId ? t.editBudget : t.addBudget}
      >
        <div className="grid gap-3 sm:grid-cols-2">
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
                  <option
                    key={category.id}
                    value={category.id}
                    data-icon-emoji={
                      category.iconPresentation.type === "unicode"
                        ? category.iconPresentation.value
                        : undefined
                    }
                  >
                    {localizeFinanceCategory(
                      category.name,
                      category.key,
                      locale,
                    )}
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
            className="w-full sm:col-span-2"
            disabled={!categoryId || !amount || save.isPending}
            onClick={() => save.mutate()}
          >
            {t.saveBudget}
          </Button>
          {save.isError ? (
            <p className="mt-2 text-sm text-rose-300 sm:col-span-2">
              {t.financeUnavailable}
            </p>
          ) : null}
        </div>
      </Modal>
      {dashboardData.limits.map((limit) => {
        const value = Math.min(100, limit.percentage);
        const categoryName = localizeFinanceCategory(
          limit.category.name,
          limit.category.key,
          locale,
        );
        return (
          <Card key={limit.id}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <IconAvatar icon={limit.category.iconPresentation} size="sm" />
                <strong className="truncate">{categoryName}</strong>
              </div>
              <div className="flex items-center gap-2">
                <span className={limit.percentage > 100 ? "text-rose-300" : ""}>
                  {formatMoney(limit.spent, limit.currency, "symbol")} /{" "}
                  {formatMoney(limit.amount, limit.currency, "symbol")}
                </span>
                <FinanceCardActionsMenu
                  label={t.actions}
                  actions={[
                    {
                      label: t.editBudget,
                      icon: <Pencil size={16} />,
                      onSelect: () => {
                        setCategoryId(limit.categoryId);
                        setAmount(limit.amount);
                        setEditorOpen(true);
                      },
                    },
                    {
                      label: t.deleteBudget,
                      icon: <Trash2 size={16} />,
                      onSelect: () => setDeleting(limit),
                      danger: true,
                    },
                  ]}
                />
              </div>
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
      <FinanceConfirmModal
        open={!!deleting}
        locale={locale}
        entityName={deleting?.category.name ?? ""}
        actionLabel={t.deleteBudget}
        description={t.deleteDescription}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? remove.mutateAsync(deleting.id) : undefined
        }
      />
      {!smartLimits.isLoading &&
      !smartLimits.isError &&
      !Array.isArray(smartLimits.data) ? (
        <FinancePlanPromotion
          eyebrow={t.planEyebrow}
          title={t.smartUpgrade}
          description={t.smartPro}
          cta={t.upgradePlan}
          tier="PRO"
          onUpgrade={onUpgrade}
        />
      ) : (
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
          ) : null}
        </Card>
      )}
    </div>
  );
}
