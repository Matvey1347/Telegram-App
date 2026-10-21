"use client";

import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import type {
  ConsumerFinanceDebt,
  ConsumerFinanceDebtStatus,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FinanceCardActionsMenu,
  LoadingState,
  Select,
} from "@consumer-finance/web/components/ui";
import { IconAvatar } from "@consumer-finance/web/components/ui/finance-icon-avatar";
import { FinanceDebtCreateModal } from "@consumer-finance/web/components/obligations/finance-debt-create-modal";
import { FinanceDebtEditor } from "@consumer-finance/web/components/obligations/finance-debt-editor";
import { FinanceDebtSettlementModal } from "@consumer-finance/web/components/obligations/finance-debt-settlement-modal";
import { FinanceConfirmModal } from "@consumer-finance/web/components/shared/finance-confirm-modal";
import { consumerFinanceObligationsApi } from "@consumer-finance/web/lib/api/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import {
  invalidateConsumerFinanceLedgerReads,
  removeConsumerDebtFromPages,
  reconcileConsumerDebtPages,
} from "@consumer-finance/web/lib/cache/consumer-finance-obligations-cache";
import { reconcileConsumerTransactionCaches } from "@consumer-finance/web/lib/cache/consumer-finance-cache";
import { formatMoney } from "@consumer-finance/web/lib/formatters/consumer-finance-money";
import { financeIntlLocale, type FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeDebtsCopy } from "@consumer-finance/web/components/i18n/debts";
import type { ConsumerFinanceDebtTarget } from "@consumer-finance/web/components/app/consumer-finance-navigation";

export function FinanceDebts({
  botId,
  locale,
  timezone,
  target = null,
  targetMalformed = false,
}: {
  botId: string;
  locale: FinanceLocale;
  timezone: string;
  target?: ConsumerFinanceDebtTarget | null;
  targetMalformed?: boolean;
}) {
  const t = financeDebtsCopy(locale);
  const client = useQueryClient();
  const [status, setStatus] = useState<ConsumerFinanceDebtStatus>("OPEN");
  const [editing, setEditing] = useState<ConsumerFinanceDebt | "create" | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [settling, setSettling] = useState<ConsumerFinanceDebt | null>(null);
  const [deleting, setDeleting] = useState<ConsumerFinanceDebt | null>(null);
  const [dismissedTargetId, setDismissedTargetId] = useState<string | null>(null);
  const targetedDebt = useQuery({
    queryKey: consumerFinanceKeys.debts(botId, { id: target?.debtId, limit: 1 }),
    queryFn: () => consumerFinanceObligationsApi.debts(botId, { id: target?.debtId, limit: 1 }),
    enabled: Boolean(target?.debtId),
  });
  useEffect(() => {
    const debt = targetedDebt.data?.items[0];
    if (debt?.status === "OPEN" && !settling && dismissedTargetId !== debt.id) {
      setSettling(debt);
    }
  }, [dismissedTargetId, settling, targetedDebt.data]);
  const debts = useInfiniteQuery({
    queryKey: consumerFinanceKeys.debts(botId, { status, limit: 50 }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      consumerFinanceObligationsApi.debts(botId, {
        status,
        limit: 50,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const settle = useMutation({
    mutationFn: ({
      debt,
      accountId,
      amount,
      settlementDate,
    }: {
      debt: ConsumerFinanceDebt;
      accountId: string;
      amount: string;
      settlementDate: string;
    }) =>
      consumerFinanceObligationsApi.settleDebt(botId, debt.id, {
        accountId,
        amount,
        settlementDate,
      }),
    onSuccess: (result) => {
      reconcileConsumerDebtPages(client, botId, result.debt);
      reconcileConsumerTransactionCaches(
        client,
        botId,
        result.transaction,
        timezone,
      );
      setSettling(null);
      void invalidateConsumerFinanceLedgerReads(client, botId);
    },
  });
  const remove = useMutation({
    mutationFn: (debt: ConsumerFinanceDebt) =>
      consumerFinanceObligationsApi.deleteDebt(botId, debt.id),
    onSuccess: (_, debt) => {
      removeConsumerDebtFromPages(client, botId, debt.id);
      void invalidateConsumerFinanceLedgerReads(client, botId);
    },
  });
  const items = debts.data?.pages.flatMap((page) => page.items) ?? [];
  const saveDebt = (debt: ConsumerFinanceDebt) => {
    reconcileConsumerDebtPages(client, botId, debt);
    setEditing(null);
  };
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Button className="w-full" onClick={() => setCreating(true)}>
          {t.addDebt}
        </Button>
        <div className="w-full">
          <label className="mb-1 block text-sm text-neutral-300">
            {t.status}
          </label>
          <Select
            uiLocale={locale}
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ConsumerFinanceDebtStatus)
            }
          >
            <option value="OPEN">🟢 {t.openDebts}</option>
            <option value="SETTLED">✅ {t.settledDebts}</option>
          </Select>
        </div>
      </div>
      {debts.isLoading ? (
        <LoadingState text={t.loadingDebts} />
      ) : debts.isError ? (
        <div className="space-y-3">
          <ErrorState text={t.debtLoadError} />
          <Button onClick={() => debts.refetch()}>{t.retry}</Button>
        </div>
      ) : items.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((debt) => (
            <DebtCard
              key={debt.id}
              debt={debt}
              locale={locale}
              onEdit={() => setEditing(debt)}
              onSettle={() => setSettling(debt)}
              onDelete={() => setDeleting(debt)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          text={status === "OPEN" ? t.noOpenDebts : t.noSettledDebts}
        />
      )}
      {targetMalformed || (target && targetedDebt.isSuccess && !targetedDebt.data.items[0]) ? (
        <ErrorState text={t.debtLoadError} />
      ) : null}
      {debts.hasNextPage ? (
        <Button
          className="w-full"
          variant="secondary"
          disabled={debts.isFetchingNextPage}
          onClick={() => debts.fetchNextPage()}
        >
          {debts.isFetchingNextPage ? t.loading : t.loadMore}
        </Button>
      ) : null}
      {editing ? (
        <FinanceDebtEditor
          key={editing === "create" ? "create" : editing.id}
          botId={botId}
          editing={editing === "create" ? null : editing}
          locale={locale}
          timezone={timezone}
          onClose={() => setEditing(null)}
          onSaved={saveDebt}
        />
      ) : null}
      {creating ? (
        <FinanceDebtCreateModal
          debts={items.filter((debt) => debt.status === "OPEN")}
          locale={locale}
          onClose={() => setCreating(false)}
          onCreateNew={() => {
            setCreating(false);
            setEditing("create");
          }}
          onSettle={(debt) => {
            setCreating(false);
            setSettling(debt);
          }}
        />
      ) : null}
      {settling ? (
        <FinanceDebtSettlementModal
          key={settling.id}
          debt={settling}
          locale={locale}
          onClose={() => {
            if (target?.debtId === settling.id) setDismissedTargetId(settling.id);
            setSettling(null);
          }}
          botId={botId}
          onCreate={(debt, accountId, amount, settlementDate) =>
            settle.mutateAsync({
              debt,
              accountId,
              amount,
              settlementDate,
            })
          }
        />
      ) : null}
      {settle.isError ? <ErrorState text={t.debtSettleError} /> : null}
      <FinanceConfirmModal
        key={deleting?.id ?? "delete-debt"}
        open={Boolean(deleting)}
        locale={locale}
        entityName={deleting?.name ?? ""}
        actionLabel={t.deleteDebt}
        description={t.deleteDebtDescription}
        onClose={() => setDeleting(null)}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting) : undefined)}
      />
      {remove.isError ? <ErrorState text={t.debtDeleteError} /> : null}
    </div>
  );
}

function DebtCard({
  debt,
  locale,
  onEdit,
  onSettle,
  onDelete,
}: {
  debt: ConsumerFinanceDebt;
  locale: FinanceLocale;
  onEdit: () => void;
  onSettle: () => void;
  onDelete: () => void;
}) {
  const t = financeDebtsCopy(locale);
  return (
    <Card className={debt.isOverdue ? "border-rose-700" : ""}>
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3 pr-12 sm:pr-0">
          <IconAvatar
            icon={debt.account.iconPresentation}
            label={debt.account.name}
            size="sm"
            bordered={false}
          />
          <div className="min-w-0">
            <h2 className="truncate font-medium">{debt.name}</h2>
            <p className="text-xs text-neutral-400">
              {debt.direction === "I_OWE" ? t.iOwe : t.owedToMe} ·{" "}
              {debt.account.name}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <strong className="shrink-0 tabular-nums">
            {formatMoney(debt.amount, debt.currency, "symbol")}
          </strong>
          <div className="absolute right-0 top-0 sm:static">
            <FinanceCardActionsMenu
              label={t.actions}
              actions={[
                ...(debt.status === "OPEN"
                  ? [
                      {
                        label: t.edit,
                        icon: <Pencil size={16} />,
                        onSelect: onEdit,
                      },
                    ]
                  : []),
                {
                  label: t.deleteDebt,
                  icon: <Trash2 size={16} />,
                  onSelect: onDelete,
                  danger: true,
                },
              ]}
            />
          </div>
        </div>
      </div>
      <p
        className={`mt-3 text-sm ${debt.isOverdue ? "font-medium text-rose-300" : "text-neutral-400"}`}
      >
        {debt.isOverdue ? `${t.overdue} · ` : ""}
        {new Intl.DateTimeFormat(financeIntlLocale(locale), {
          timeZone: debt.scheduleTimezone,
        }).format(new Date(debt.dueAt))}
        {debt.status === "SETTLED" ? ` · ${t.settled}` : ""}
      </p>
      {debt.note ? (
        <p className="mt-2 text-sm text-neutral-400">{debt.note}</p>
      ) : null}
      {debt.status === "OPEN" ? (
        <div className="mt-4 flex gap-2">
          <Button onClick={onSettle}>{t.settle}</Button>
        </div>
      ) : null}
    </Card>
  );
}
