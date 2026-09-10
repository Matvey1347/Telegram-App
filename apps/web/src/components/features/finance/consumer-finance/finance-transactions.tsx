"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import type {
  ConsumerFinanceHistoryQuery,
  ConsumerFinanceTransaction,
} from "@telegram-system/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "./ui";
import { useFinanceFeedback } from "./ui/finance-feedback";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import {
  prependConsumerTransactionToCaches,
  reconcileConsumerTransactionCaches,
  removeConsumerTransactionFromCaches,
} from "@/lib/features/finance/consumer-finance-cache";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { type FinanceLocale } from "./i18n/core";
import { financeTransactionsCopy } from "./i18n/transactions";
import type { ConsumerFinanceSurface } from "./consumer-finance-navigation";
import { FinanceTransactionEditor } from "./finance-transaction-editor";
import { FinanceTransactionFilters } from "./finance-transaction-filters";
import { useDebouncedValue } from "./use-debounced-value";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { FinanceTransactionDetailModal } from "./finance-transaction-detail-modal";
import { FinanceMobileTransactionRow } from "./finance-mobile-transaction-row";
import { DesktopTransactionTable } from "./finance-desktop-transaction-table";

export function FinanceTransactions({
  botId,
  locale,
  timezone,
  initiallyOpenType = null,
  surface,
}: {
  botId: string;
  locale: FinanceLocale;
  timezone: string;
  initiallyOpenType?: "EXPENSE" | "INCOME" | null;
  surface: ConsumerFinanceSurface;
}) {
  const client = useQueryClient();
  const t = financeTransactionsCopy(locale);
  const { pushToast } = useFinanceFeedback();
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
  // References and history are independent and intentionally start together.
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
  });
  const categories = useQuery({
    queryKey: consumerFinanceKeys.categories(botId),
    queryFn: () => consumerFinanceLedgerApi.categories(botId),
  });
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
  if (accounts.isLoading || categories.isLoading)
    return <LoadingState text={t.loadingReferences} />;
  if (accounts.isError || categories.isError)
    return (
      <div className="space-y-3">
        <ErrorState text={t.referencesUnavailable} />
        <Button
          onClick={() =>
            void Promise.all([accounts.refetch(), categories.refetch()])
          }
        >
          {t.retry}
        </Button>
      </div>
    );
  const accountRows = accounts.data ?? [];
  const categoryRows = categories.data ?? [];
  return (
    <div className="space-y-4">
      <FinanceTransactionEditor
        key={editing?.id ?? "create-transaction"}
        botId={botId}
        accounts={accountRows}
        categories={categoryRows}
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
        accounts={accountRows}
        categories={categoryRows}
        locale={locale}
        surface={surface}
        onChange={setFilters}
      />
      <Card className={surface === "telegram" ? "overflow-hidden !p-0" : ""}>
        {history.isLoading ? (
          <LoadingState text={t.loading} />
        ) : history.isError ? (
          <div className="space-y-3">
            <ErrorState text={t.transactionLoadError} />
            <Button onClick={() => history.refetch()}>{t.retry}</Button>
          </div>
        ) : items.length && surface === "browser" ? (
          <DesktopTransactionTable
            items={items}
            locale={locale}
            timezone={timezone}
            onDetail={setDetail}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        ) : items.length ? (
          <div className="divide-y divide-neutral-800">
            {items.map((item) => (
              <FinanceMobileTransactionRow
                key={item.id}
                item={item}
                locale={locale}
                timezone={timezone}
                onDetail={() => setDetail(item)}
                onEdit={() => setEditing(item)}
                onDelete={() => setDeleting(item)}
              />
            ))}
          </div>
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
