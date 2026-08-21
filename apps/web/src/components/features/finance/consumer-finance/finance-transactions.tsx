"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { List, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceHistoryQuery,
  ConsumerFinanceTransaction,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import {
  prependConsumerTransactionToCaches,
  reconcileConsumerTransactionCaches,
  removeConsumerTransactionFromCaches,
} from "@/lib/features/finance/transaction-cache";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { TransactionRow } from "./finance-dashboard";
import { financeCopy, type FinanceLocale } from "./finance-i18n";
import { FinanceTransactionEditor } from "./finance-transaction-editor";
import { FinanceTransactionFilters } from "./finance-transaction-filters";
import { useDebouncedValue } from "./use-debounced-value";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { FinanceTransactionDetailModal } from "./finance-transaction-detail-modal";

export function FinanceTransactions({
  botId,
  accounts,
  categories,
  locale,
  timezone,
  initiallyOpenType = null,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  locale: FinanceLocale;
  timezone: string;
  initiallyOpenType?: "EXPENSE" | "INCOME" | null;
}) {
  const client = useQueryClient();
  const t = financeCopy(locale);
  const { pushToast } = useAppToast();
  const [filters, setFilters] = useState<ConsumerFinanceHistoryQuery>({
    limit: 30,
  });
  const [editing, setEditing] = useState<ConsumerFinanceTransaction | null>(
    null,
  );
  const [deleting, setDeleting] = useState<ConsumerFinanceTransaction | null>(
    null,
  );
  const [detail, setDetail] = useState<ConsumerFinanceTransaction | null>(null);
  const [undoable, setUndoable] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(filters.search);
  const queryFilters = { ...filters, search: debouncedSearch };
  const history = useInfiniteQuery({
    queryKey: consumerFinanceKeys.transactions(botId, {
      ...queryFilters,
      cursor: undefined,
    }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      consumerFinanceApi.transactions(botId, {
        ...queryFilters,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const invalidateDerived = () => {
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.dashboard(botId),
    });
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.analyticsRoot(botId),
    });
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.ultimateRoot(botId),
    });
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.accounts(botId),
    });
  };
  const remove = useMutation({
    mutationFn: (id: string) => consumerFinanceApi.deleteTransaction(botId, id),
    onSuccess: (_, id) => {
      removeConsumerTransactionFromCaches(client, botId, id);
      setUndoable(id);
      setDeleting(null);
      invalidateDerived();
      pushToast(t.transactionDeleted, "info");
    },
    onError: () => pushToast(t.transactionDeleteError, "error"),
  });
  const undo = useMutation({
    mutationFn: (id: string) => consumerFinanceApi.undoTransaction(botId, id),
    onSuccess: (result) => {
      setUndoable(null);
      if (result.transaction)
        prependConsumerTransactionToCaches(
          client,
          botId,
          result.transaction,
          timezone,
        );
      else
        void client.invalidateQueries({
          queryKey: consumerFinanceKeys.transactionLists(botId),
        });
      invalidateDerived();
      pushToast(t.transactionRestored, "success");
    },
    onError: () => pushToast(t.transactionUndoError, "error"),
  });
  return (
    <div className="space-y-4">
      <FinanceTransactionEditor
        key={editing?.id ?? "create-transaction"}
        botId={botId}
        accounts={accounts}
        categories={categories}
        editing={editing}
        locale={locale}
        timezone={timezone}
        initiallyOpenType={initiallyOpenType}
        onClose={() => setEditing(null)}
        onSaved={(item) => {
          reconcileConsumerTransactionCaches(client, botId, item, timezone);
          setEditing(null);
          invalidateDerived();
        }}
      />
      <FinanceTransactionFilters
        filters={filters}
        accounts={accounts}
        categories={categories}
        locale={locale}
        onChange={setFilters}
      />
      <Card>
        {history.isLoading ? (
          <LoadingState />
        ) : history.isError ? (
          <div className="space-y-3">
            <ErrorState text={t.transactionLoadError} />
            <Button onClick={() => history.refetch()}>{t.retry}</Button>
          </div>
        ) : items.length ? (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <TransactionRow
                  item={item}
                  locale={locale}
                  timezone={timezone}
                />
              </div>
              <button
                aria-label={t.transactionDetails}
                onClick={() => setDetail(item)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded text-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
              >
                <List size={16} />
              </button>
              <button
                aria-label={t.editTransactionLabel}
                onClick={() => setEditing(item)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
              >
                <Pencil size={16} />
              </button>
              <button
                aria-label={t.deleteTransactionLabel}
                onClick={() => setDeleting(item)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <EmptyState text={t.noTransactions} />
        )}
      </Card>
      {history.hasNextPage ? (
        <Button
          variant="secondary"
          className="w-full"
          disabled={history.isFetchingNextPage}
          onClick={() => history.fetchNextPage()}
        >
          {history.isFetchingNextPage ? t.loading : t.loadMore}
        </Button>
      ) : null}
      {undoable ? (
        <Button
          variant="secondary"
          className="w-full"
          disabled={undo.isPending}
          onClick={() => undo.mutate(undoable)}
        >
          <RotateCcw size={16} /> {t.undoTransaction}
        </Button>
      ) : null}
      <FinanceConfirmModal
        open={!!deleting}
        locale={locale}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? remove.mutateAsync(deleting.id) : Promise.resolve()
        }
        entityName={deleting?.description || t.transactionFallback}
        actionLabel={t.delete}
        description={t.deleteTransactionDescription}
      />
      <FinanceTransactionDetailModal
        botId={botId}
        transaction={detail}
        locale={locale}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
