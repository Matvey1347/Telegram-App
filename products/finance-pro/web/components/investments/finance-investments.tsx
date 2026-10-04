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
  ConsumerFinanceInvestmentSortBy,
  ConsumerFinanceInvestmentSortDirection,
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
import { FinanceInvestmentCreateModal } from "./finance-investment-create-modal";
import { FinanceSortControl } from "./ui/finance-sort-control";

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
  const [sortBy, setSortBy] =
    useState<ConsumerFinanceInvestmentSortBy>("UPDATED");
  const [sortDirection, setSortDirection] =
    useState<ConsumerFinanceInvestmentSortDirection>("DESC");
  const [editing, setEditing] = useState<ConsumerFinanceInvestment | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const filters = {
    ...(status === "ALL" ? {} : { status }),
    sortBy,
    sortDirection,
  };
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
      const update = {
        name: payload.name,
        description: payload.description,
        type: payload.type,
        customTypeName: payload.customTypeName,
        customTypeEmoji: payload.customTypeEmoji,
        startedAt: payload.startedAt,
      };
      return consumerFinanceInvestmentsApi.update(botId, editing!.id, update);
    },
    onSuccess: (investment) => {
      patchInvestment(client, botId, investment);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.investmentSummary(botId),
      });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.investmentLists(botId),
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
        <Button onClick={() => setCreating(true)}>{t.add}</Button>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">{t.summary}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Metric
            label={t.totalInvested}
            value={formatMoney(s.totalInvested, s.currency, "symbol")}
            tone="sky"
          />
          <Metric
            label={t.totalReturned}
            value={formatMoney(s.totalReturned, s.currency, "symbol")}
            tone="emerald"
          />
          <Metric
            label={t.currentValue}
            value={formatMoney(s.currentValue, s.currency, "symbol")}
            tone="violet"
          />
          <Metric
            label={t.profitLoss}
            value={formatMoney(s.profitLoss, s.currency, "symbol")}
            tone={Number(s.profitLoss) < 0 ? "rose" : "emerald"}
          />
          <Metric
            label={t.returnPercentage}
            value={
              s.returnPercentage == null
                ? "—"
                : `${s.returnPercentage.toFixed(2)}%`
            }
            tone={Number(s.returnPercentage) < 0 ? "rose" : "emerald"}
          />
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-neutral-300">
            {t.status}
          </label>
          <Select
            uiLocale={locale}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="ACTIVE" className="text-emerald-300">
              {t.active}
            </option>
            <option value="CLOSED" className="text-sky-300">
              {t.closed}
            </option>
            <option value="ARCHIVED" className="text-neutral-400">
              {t.archived}
            </option>
            <option value="ALL" className="text-violet-300">
              {t.all}
            </option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-300">
            {t.sortBy}
          </label>
          <FinanceSortControl
            locale={locale}
            field={sortBy}
            options={[
              { value: "UPDATED", label: t.sortUpdated },
              { value: "NAME", label: t.sortName },
              { value: "INVESTED", label: t.sortInvested },
              { value: "CURRENT_VALUE", label: t.sortCurrentValue },
            ]}
            direction={sortDirection}
            fieldLabel={t.sortBy}
            ascendingLabel={t.sortAscending}
            descendingLabel={t.sortDescending}
            onFieldChange={setSortBy}
            onDirectionChange={setSortDirection}
          />
        </div>
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
          investment={editing}
          locale={locale}
          defaultCurrency={defaultCurrency}
          pending={save.isPending}
          error={save.isError}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => save.mutate(payload)}
        />
      ) : null}
      {creating ? (
        <FinanceInvestmentCreateModal
          botId={botId}
          locale={locale}
          defaultCurrency={defaultCurrency}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "sky" | "emerald" | "violet" | "rose";
}) {
  const colors = {
    sky: "border-sky-900/70 bg-neutral-950/40 [&>p:last-child]:text-sky-200",
    emerald:
      "border-emerald-900/70 bg-neutral-950/40 [&>p:last-child]:text-emerald-200",
    violet:
      "border-violet-900/70 bg-neutral-950/40 [&>p:last-child]:text-violet-200",
    rose: "border-rose-900/70 bg-neutral-950/40 [&>p:last-child]:text-rose-200",
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[tone]}`}>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
