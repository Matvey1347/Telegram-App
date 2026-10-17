"use client";

import { useRef, useState } from "react";
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
} from "@consumer-finance/web/components/ui";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeInvestmentsCopy } from "@consumer-finance/web/components/i18n/investments";
import { consumerFinanceInvestmentsApi } from "@consumer-finance/web/lib/api/consumer-finance-investments-api";
import { consumerFinanceLedgerApi } from "@consumer-finance/web/lib/api/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import {
  invalidateConsumerAssetDerivations,
  patchInvestment,
  patchInvestmentMutation,
} from "@consumer-finance/web/lib/cache/consumer-finance-assets-cache";
import { consumerFinanceRequestId } from "@consumer-finance/web/lib/assets/consumer-finance-assets";
import { formatMoney } from "@consumer-finance/web/lib/formatters/consumer-finance-money";
import { FinanceInvestmentCard } from "@consumer-finance/web/components/investments/finance-investment-card";
import { FinanceInvestmentEditor } from "@consumer-finance/web/components/investments/finance-investment-editor";
import { FinanceInvestmentCreateModal } from "@consumer-finance/web/components/investments/finance-investment-create-modal";
import {
  FinanceInvestmentActionModal,
  type InvestmentActionValues,
} from "@consumer-finance/web/components/investments/finance-investment-action-modal";
import { FinanceConfirmModal } from "@consumer-finance/web/components/shared/finance-confirm-modal";
import { FinanceSortControl } from "@consumer-finance/web/components/ui/finance-sort-control";

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
  const [contributing, setContributing] =
    useState<ConsumerFinanceInvestment | null>(null);
  const [archiving, setArchiving] = useState<ConsumerFinanceInvestment | null>(
    null,
  );
  const contributionAttempt = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
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
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
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
  const contribute = useMutation({
    mutationFn: (values: InvestmentActionValues) => {
      const investment = contributing;
      if (!investment) throw new Error("Investment is required");
      const fingerprint = JSON.stringify({
        investmentId: investment.id,
        values,
      });
      if (contributionAttempt.current?.fingerprint !== fingerprint)
        contributionAttempt.current = {
          fingerprint,
          idempotencyKey: consumerFinanceRequestId("investment-contribution"),
        };
      return consumerFinanceInvestmentsApi.addCashFlow(botId, investment.id, {
        kind: "CONTRIBUTION",
        accountId: values.accountId!,
        amount: values.amount!,
        occurredAt: values.occurredAt,
        note: values.note,
        idempotencyKey: contributionAttempt.current.idempotencyKey,
      });
    },
    retry: false,
    onSuccess: (result) => {
      contributionAttempt.current = null;
      patchInvestmentMutation(client, botId, result);
      invalidateConsumerAssetDerivations(client, botId);
      setContributing(null);
    },
  });
  const archive = useMutation({
    mutationFn: (investment: ConsumerFinanceInvestment) =>
      consumerFinanceInvestmentsApi.archive(botId, investment.id),
    retry: false,
    onSuccess: (investment) => {
      patchInvestment(client, botId, investment);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.investmentSummary(botId),
      });
      invalidateConsumerAssetDerivations(client, botId);
      setArchiving(null);
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
            <option value="ACTIVE">🟢 {t.active}</option>
            <option value="CLOSED">✅ {t.closed}</option>
            <option value="ARCHIVED">📦 {t.archived}</option>
            <option value="ALL">◌ {t.all}</option>
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
              onContribution={() => setContributing(investment)}
              onArchive={() => setArchiving(investment)}
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
      {contributing ? (
        <FinanceInvestmentActionModal
          key={`${contributing.id}-${accounts.data?.[0]?.id ?? "loading"}`}
          open
          action="CONTRIBUTION"
          investment={contributing}
          accounts={accounts.data ?? []}
          valuations={[]}
          locale={locale}
          pending={contribute.isPending || accounts.isLoading}
          error={contribute.isError || accounts.isError}
          onClose={() => {
            contributionAttempt.current = null;
            setContributing(null);
          }}
          onSubmit={(values) => contribute.mutate(values)}
        />
      ) : null}
      {archiving ? (
        <FinanceConfirmModal
          open
          locale={locale}
          entityName={archiving.name}
          actionLabel={t.archiveInvestment}
          description={t.confirmArchive}
          onClose={() => setArchiving(null)}
          onConfirm={() => archive.mutateAsync(archiving)}
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
