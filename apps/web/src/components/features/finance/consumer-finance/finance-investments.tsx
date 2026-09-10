"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  ConsumerFinanceInvestment,
  ConsumerFinanceInvestmentInput,
  ConsumerFinanceInvestmentStatus,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
} from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeInvestmentsCopy } from "./i18n/investments";
import { consumerFinanceInvestmentsApi } from "@/lib/features/finance/consumer-finance-investments-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  invalidateConsumerAssetDerivations,
  patchInvestment,
} from "@/lib/features/finance/consumer-finance-assets-cache";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { FinanceInvestmentCard } from "./finance-investment-card";
import { FinanceInvestmentEditor } from "./finance-investment-editor";

type StatusFilter = ConsumerFinanceInvestmentStatus | "ALL";

export function FinanceInvestments({
  botId,
  locale,
  defaultCurrency,
  onOpen,
}: {
  botId: string;
  locale: FinanceLocale;
  defaultCurrency: string;
  onOpen: (id: string) => void;
}) {
  const t = financeInvestmentsCopy(locale);
  const client = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");
  const [editing, setEditing] = useState<
    ConsumerFinanceInvestment | "new" | null
  >(null);
  const filters = status === "ALL" ? {} : { status };
  const list = useInfiniteQuery({
    queryKey: consumerFinanceKeys.investments(botId, filters),
    queryFn: ({ pageParam }) =>
      consumerFinanceInvestmentsApi.list(botId, {
        ...filters,
        cursor: pageParam,
        limit: 30,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const summary = useQuery({
    queryKey: consumerFinanceKeys.investmentSummary(botId),
    queryFn: () => consumerFinanceInvestmentsApi.summary(botId),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (payload: ConsumerFinanceInvestmentInput) => {
      if (editing === "new")
        return consumerFinanceInvestmentsApi.create(botId, payload);
      const update = {
        name: payload.name,
        description: payload.description,
        type: payload.type,
        startedAt: payload.startedAt,
      };
      return consumerFinanceInvestmentsApi.update(botId, editing!.id, update);
    },
    onSuccess: (investment) => {
      patchInvestment(client, botId, investment);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.investmentSummary(botId),
      });
      invalidateConsumerAssetDerivations(client, botId);
      setEditing(null);
    },
  });
  if (list.isLoading || summary.isLoading)
    return <LoadingState text={t.loading} />;
  if (list.isError || summary.isError || !list.data || !summary.data)
    return (
      <div className="space-y-3">
        <ErrorState text={t.loadError} />
        <Button
          onClick={() => void Promise.all([list.refetch(), summary.refetch()])}
        >
          {t.retry}
        </Button>
      </div>
    );
  const visible = list.data.pages.flatMap((page) => page.items);
  const s = summary.data;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            {t.subtitle}
          </p>
          <p className="mt-2 text-xs text-sky-300">{t.manualOnly}</p>
        </div>
        <Button onClick={() => setEditing("new")}>{t.add}</Button>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">{t.summary}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Metric
            label={t.totalInvested}
            value={formatMoney(s.totalInvested, s.currency, "symbol")}
          />
          <Metric
            label={t.totalReturned}
            value={formatMoney(s.totalReturned, s.currency, "symbol")}
          />
          <Metric
            label={t.currentValue}
            value={formatMoney(s.currentValue, s.currency, "symbol")}
          />
          <Metric
            label={t.profitLoss}
            value={formatMoney(s.profitLoss, s.currency, "symbol")}
          />
          <Metric
            label={t.returnPercentage}
            value={
              s.returnPercentage == null
                ? "—"
                : `${s.returnPercentage.toFixed(2)}%`
            }
          />
        </div>
        {s.excludedInvestments.length ? (
          <p className="mt-3 text-xs text-amber-300">{t.excluded}</p>
        ) : null}
      </Card>
      <div className="max-w-xs">
        <label className="mb-1 block text-sm text-neutral-300">
          {t.status}
        </label>
        <Select
          uiLocale={locale}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
        >
          <option value="ACTIVE">{t.active}</option>
          <option value="CLOSED">{t.closed}</option>
          <option value="ARCHIVED">{t.archived}</option>
          <option value="ALL">{t.all}</option>
        </Select>
      </div>
      {visible.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((investment) => (
            <FinanceInvestmentCard
              key={investment.id}
              investment={investment}
              locale={locale}
              onOpen={() => onOpen(investment.id)}
              onEdit={() => setEditing(investment)}
            />
          ))}
        </div>
      ) : (
        <EmptyState text={t.empty} />
      )}
      {list.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          {t.loadMore}
        </Button>
      ) : null}
      {editing ? (
        <FinanceInvestmentEditor
          open={editing !== null}
          investment={editing === "new" ? null : editing}
          locale={locale}
          defaultCurrency={defaultCurrency}
          pending={save.isPending}
          error={save.isError}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => save.mutate(payload)}
        />
      ) : null}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{value}</p>
    </div>
  );
}
