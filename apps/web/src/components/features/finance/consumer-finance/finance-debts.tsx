"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import type {
  ConsumerFinanceDebt,
  ConsumerFinanceDebtStatus,
} from "@telegram-system/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "./ui";
import { IconAvatar } from "./ui/finance-icon-avatar";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { FinanceDebtEditor } from "./finance-debt-editor";
import { consumerFinanceObligationsApi } from "@/lib/features/finance/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  invalidateConsumerFinanceLedgerReads,
  reconcileConsumerDebtPages,
} from "@/lib/features/finance/consumer-finance-obligations-cache";
import { reconcileConsumerTransactionCaches } from "@/lib/features/finance/consumer-finance-cache";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financeDebtsCopy } from "./i18n/debts";

export function FinanceDebts({
  botId,
  locale,
  timezone,
}: {
  botId: string;
  locale: FinanceLocale;
  timezone: string;
}) {
  const t = financeDebtsCopy(locale);
  const client = useQueryClient();
  const [status, setStatus] = useState<ConsumerFinanceDebtStatus>("OPEN");
  const [editing, setEditing] = useState<ConsumerFinanceDebt | "create" | null>(
    null,
  );
  const [settling, setSettling] = useState<ConsumerFinanceDebt | null>(null);
  const debts = useInfiniteQuery({
    queryKey: consumerFinanceKeys.debts(botId, { status, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      consumerFinanceObligationsApi.debts(botId, {
        status,
        limit: 30,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const settle = useMutation({
    mutationFn: (debt: ConsumerFinanceDebt) =>
      consumerFinanceObligationsApi.settleDebt(botId, debt.id),
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
  const items = debts.data?.pages.flatMap((page) => page.items) ?? [];
  const saveDebt = (debt: ConsumerFinanceDebt) => {
    reconcileConsumerDebtPages(client, botId, debt);
    setEditing(null);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="tablist">
          {(["OPEN", "SETTLED"] as const).map((value) => (
            <Button
              key={value}
              role="tab"
              aria-selected={status === value}
              variant={status === value ? "primary" : "secondary"}
              onClick={() => setStatus(value)}
            >
              {value === "OPEN" ? t.openDebts : t.settledDebts}
            </Button>
          ))}
        </div>
        <Button onClick={() => setEditing("create")}>{t.addDebt}</Button>
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
            />
          ))}
        </div>
      ) : (
        <EmptyState
          text={status === "OPEN" ? t.noOpenDebts : t.noSettledDebts}
        />
      )}
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
      <FinanceConfirmModal
        key={settling?.id ?? "settle-debt"}
        open={!!settling}
        locale={locale}
        entityName={settling?.name ?? ""}
        actionLabel={t.settle}
        description={t.settleDescription}
        onClose={() => setSettling(null)}
        onConfirm={() => (settling ? settle.mutateAsync(settling) : undefined)}
      />
      {settle.isError ? <ErrorState text={t.debtSettleError} /> : null}
    </div>
  );
}

function DebtCard({
  debt,
  locale,
  onEdit,
  onSettle,
}: {
  debt: ConsumerFinanceDebt;
  locale: FinanceLocale;
  onEdit: () => void;
  onSettle: () => void;
}) {
  const t = financeDebtsCopy(locale);
  return (
    <Card className={debt.isOverdue ? "border-rose-700" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
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
        <strong className="shrink-0 tabular-nums">
          {formatMoney(debt.amount, debt.currency, "symbol")}
        </strong>
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
          <Button variant="secondary" onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" /> {t.edit}
          </Button>
          <Button onClick={onSettle}>{t.settle}</Button>
        </div>
      ) : null}
    </Card>
  );
}
