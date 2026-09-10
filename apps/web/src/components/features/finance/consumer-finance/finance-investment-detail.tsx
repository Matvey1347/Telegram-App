"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  CircleDollarSign,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type {
  ConsumerFinanceInvestmentDetail,
  ConsumerFinanceInvestmentInput,
  ConsumerFinanceInvestmentMutation,
} from "@telegram-system/shared";
import { Button, Card, ErrorState, LoadingState } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeInvestmentsCopy } from "./i18n/investments";
import { consumerFinanceInvestmentsApi } from "@/lib/features/finance/consumer-finance-investments-api";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { consumerFinanceRequestId } from "@/lib/features/finance/consumer-finance-assets";
import {
  invalidateConsumerAssetDerivations,
  patchInvestment,
  patchInvestmentMutation,
} from "@/lib/features/finance/consumer-finance-assets-cache";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import {
  FinanceInvestmentEditor,
  investmentTypeLabel,
} from "./finance-investment-editor";
import {
  FinanceInvestmentActionModal,
  type InvestmentAction,
  type InvestmentActionValues,
} from "./finance-investment-action-modal";
import { FinanceInvestmentValuationChart } from "./finance-investment-valuation-chart";
import { FinanceInvestmentMetric } from "./finance-investment-metric";
import { FinanceInvestmentHistories } from "./finance-investment-histories";
import { useFinanceInvestmentHistories } from "./use-finance-investment-histories";

export function FinanceInvestmentDetailScreen({
  botId,
  investmentId,
  locale,
  defaultCurrency,
  onBack,
}: {
  botId: string;
  investmentId: string;
  locale: FinanceLocale;
  defaultCurrency: string;
  onBack: () => void;
}) {
  const t = financeInvestmentsCopy(locale);
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<InvestmentAction | null>(null);
  const mutationAttempt = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const detail = useQuery({
    queryKey: consumerFinanceKeys.investment(botId, investmentId),
    queryFn: () => consumerFinanceInvestmentsApi.get(botId, investmentId),
    retry: false,
  });
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
    retry: false,
  });
  const { cashFlows, valuations } = useFinanceInvestmentHistories(
    botId,
    investmentId,
  );
  const edit = useMutation({
    mutationFn: (payload: ConsumerFinanceInvestmentInput) => {
      const update = {
        name: payload.name,
        description: payload.description,
        type: payload.type,
        startedAt: payload.startedAt,
      };
      return consumerFinanceInvestmentsApi.update(botId, investmentId, update);
    },
    onSuccess: (investment) => {
      patchInvestment(client, botId, investment);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.investmentSummary(botId),
      });
      invalidateConsumerAssetDerivations(client, botId);
      setEditing(false);
    },
  });
  const reconcile = (result: ConsumerFinanceInvestmentMutation) => {
    patchInvestmentMutation(client, botId, result);
    client.setQueryData<ConsumerFinanceInvestmentDetail>(
      consumerFinanceKeys.investment(botId, investmentId),
      (current) =>
        current
          ? {
              ...current,
              ...result.investment,
              cashFlows: result.cashFlow
                ? {
                    ...current.cashFlows,
                    items: [
                      result.cashFlow,
                      ...current.cashFlows.items.filter(
                        (item) => item.id !== result.cashFlow!.id,
                      ),
                    ],
                  }
                : current.cashFlows,
              valuations: result.valuation
                ? {
                    ...current.valuations,
                    items: [
                      result.valuation,
                      ...current.valuations.items.filter(
                        (item) => item.id !== result.valuation!.id,
                      ),
                    ],
                  }
                : current.valuations,
            }
          : current,
    );
    invalidateConsumerAssetDerivations(client, botId);
    setAction(null);
  };
  const mutate = useMutation({
    mutationFn: ({
      kind,
      values,
    }: {
      kind: InvestmentAction;
      values: InvestmentActionValues;
    }) => {
      const fingerprint = JSON.stringify({ kind, values });
      if (mutationAttempt.current?.fingerprint !== fingerprint)
        mutationAttempt.current = {
          fingerprint,
          idempotencyKey: consumerFinanceRequestId(
            `investment-${kind.toLowerCase()}`,
          ),
        };
      const idempotencyKey = mutationAttempt.current.idempotencyKey;
      if (kind === "CONTRIBUTION" || kind === "RETURN")
        return consumerFinanceInvestmentsApi.addCashFlow(botId, investmentId, {
          kind,
          accountId: values.accountId!,
          amount: values.amount!,
          occurredAt: values.occurredAt,
          note: values.note,
          idempotencyKey,
        });
      if (kind === "VALUATION")
        return consumerFinanceInvestmentsApi.addValuation(botId, investmentId, {
          value: values.value!,
          valuedAt: values.occurredAt,
          correctsValuationId: values.correctsValuationId,
          note: values.note,
          idempotencyKey,
        });
      return consumerFinanceInvestmentsApi.close(botId, investmentId, {
        closedAt: values.occurredAt,
        idempotencyKey,
        finalReturn: values.amount
          ? {
              accountId: values.accountId!,
              amount: values.amount,
              note: values.note,
            }
          : undefined,
      });
    },
    onSuccess: (result) => {
      mutationAttempt.current = null;
      reconcile(result);
    },
  });
  const archive = useMutation({
    mutationFn: () =>
      consumerFinanceInvestmentsApi.archive(botId, investmentId),
    onSuccess: (investment) => {
      patchInvestment(client, botId, investment);
      client.setQueryData<ConsumerFinanceInvestmentDetail>(
        consumerFinanceKeys.investment(botId, investmentId),
        (current) => (current ? { ...current, ...investment } : current),
      );
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.investmentSummary(botId),
      });
      invalidateConsumerAssetDerivations(client, botId);
    },
  });
  if (detail.isLoading || accounts.isLoading)
    return <LoadingState text={t.loading} />;
  if (detail.isError || accounts.isError || !detail.data)
    return (
      <div className="space-y-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          {t.back}
        </Button>
        <ErrorState text={t.loadError} />
        <Button
          onClick={() =>
            void Promise.all([detail.refetch(), accounts.refetch()])
          }
        >
          {t.retry}
        </Button>
      </div>
    );
  const item = detail.data;
  const cashFlowItems =
    cashFlows.data?.pages.flatMap((page) => page.items) ?? [];
  const valuationItems =
    valuations.data?.pages.flatMap((page) => page.items) ?? [];
  const pnl = Number(item.profitLoss);
  const ResultIcon =
    pnl > 0 ? TrendingUp : pnl < 0 ? TrendingDown : CircleDollarSign;
  const active = item.status === "ACTIVE";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          {t.back}
        </Button>
        <div className="flex flex-wrap gap-2">
          {item.status !== "ARCHIVED" ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t.edit}
            </Button>
          ) : null}
          {active ? (
            <>
              <Button onClick={() => setAction("CONTRIBUTION")}>
                {t.contribution}
              </Button>
              <Button variant="secondary" onClick={() => setAction("RETURN")}>
                {t.investmentReturn}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setAction("VALUATION")}
              >
                {t.valuation}
              </Button>
              <Button variant="secondary" onClick={() => setAction("CLOSE")}>
                {t.closeInvestment}
              </Button>
            </>
          ) : null}
          {item.status === "CLOSED" ? (
            <Button
              variant="secondary"
              disabled={archive.isPending}
              onClick={() => {
                if (window.confirm(t.confirmArchive)) archive.mutate();
              }}
            >
              <Archive size={16} />
              {t.archiveInvestment}
            </Button>
          ) : null}
        </div>
      </div>
      {item.status === "ARCHIVED" ? (
        <p className="text-sm text-neutral-400">{t.archivedReadOnly}</p>
      ) : null}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{item.name}</h2>
            <p className="mt-1 text-sm text-neutral-400">
              {investmentTypeLabel(item.type, t)} · {item.currency} ·{" "}
              {item.status === "ACTIVE"
                ? t.active
                : item.status === "CLOSED"
                  ? t.closed
                  : t.archived}
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              {item.description || t.noDescription}
            </p>
          </div>
          <p
            className={`flex items-center gap-2 ${pnl > 0 ? "text-emerald-300" : pnl < 0 ? "text-rose-300" : "text-neutral-300"}`}
          >
            <ResultIcon size={18} />
            {pnl > 0
              ? t.positiveResult
              : pnl < 0
                ? t.negativeResult
                : t.neutralResult}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <FinanceInvestmentMetric
            label={t.totalInvested}
            value={formatMoney(item.totalInvested, item.currency, "symbol")}
          />
          <FinanceInvestmentMetric
            label={t.totalReturned}
            value={formatMoney(item.totalReturned, item.currency, "symbol")}
          />
          <FinanceInvestmentMetric
            label={t.currentValue}
            value={formatMoney(item.currentValue, item.currency, "symbol")}
          />
          <FinanceInvestmentMetric
            label={t.profitLoss}
            value={formatMoney(item.profitLoss, item.currency, "symbol")}
          />
          <FinanceInvestmentMetric
            label={t.returnPercentage}
            value={
              item.returnPercentage == null
                ? "—"
                : `${item.returnPercentage.toFixed(2)}%`
            }
          />
        </div>
        {item.returnPercentage == null ? (
          <p className="mt-3 text-xs text-neutral-500">{t.noCapitalReturn}</p>
        ) : null}
      </Card>
      <FinanceInvestmentValuationChart
        valuations={valuationItems}
        locale={locale}
      />
      <FinanceInvestmentHistories
        cashFlows={cashFlowItems}
        valuations={valuationItems}
        locale={locale}
        cashFlowsLoading={cashFlows.isLoading}
        valuationsLoading={valuations.isLoading}
        cashFlowsError={cashFlows.isError}
        valuationsError={valuations.isError}
        cashFlowsHasMore={cashFlows.hasNextPage}
        valuationsHasMore={valuations.hasNextPage}
        loadingMoreCashFlows={cashFlows.isFetchingNextPage}
        loadingMoreValuations={valuations.isFetchingNextPage}
        onRetryCashFlows={() => cashFlows.refetch()}
        onRetryValuations={() => valuations.refetch()}
        onLoadMoreCashFlows={() => cashFlows.fetchNextPage()}
        onLoadMoreValuations={() => valuations.fetchNextPage()}
      />
      {archive.isError ? (
        <p role="alert" className="text-sm text-rose-300">
          {t.actionError}
        </p>
      ) : null}
      {editing ? (
        <FinanceInvestmentEditor
          open={editing}
          investment={item}
          locale={locale}
          defaultCurrency={defaultCurrency}
          pending={edit.isPending}
          error={edit.isError}
          onClose={() => setEditing(false)}
          onSubmit={(payload) => edit.mutate(payload)}
        />
      ) : null}
      {action ? (
        <FinanceInvestmentActionModal
          open
          action={action}
          investment={item}
          accounts={accounts.data ?? []}
          valuations={valuationItems}
          locale={locale}
          pending={mutate.isPending}
          error={mutate.isError}
          onClose={() => {
            mutationAttempt.current = null;
            setAction(null);
          }}
          onSubmit={(values) => mutate.mutate({ kind: action, values })}
        />
      ) : null}
    </div>
  );
}
