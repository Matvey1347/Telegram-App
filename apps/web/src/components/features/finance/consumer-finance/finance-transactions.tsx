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
  Table,
} from "./ui";
import { useFinanceFeedback } from "./ui/finance-feedback";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import {
  prependConsumerTransactionToCaches,
  reconcileConsumerTransactionCaches,
  removeConsumerTransactionFromCaches,
} from "@/lib/features/finance/consumer-finance-cache";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import {
  financeCopy,
  financeIntlLocale,
  localizeFinanceCategory,
  type FinanceLocale,
} from "./finance-i18n";
import type { ConsumerFinanceSurface } from "./consumer-finance-navigation";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { FinanceTransactionEditor } from "./finance-transaction-editor";
import { FinanceTransactionFilters } from "./finance-transaction-filters";
import { useDebouncedValue } from "./use-debounced-value";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { FinanceTransactionDetailModal } from "./finance-transaction-detail-modal";
import { FinanceMobileTransactionRow } from "./finance-mobile-transaction-row";

export function FinanceTransactions({
  botId,
  accounts,
  categories,
  locale,
  timezone,
  initiallyOpenType = null,
  surface,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  locale: FinanceLocale;
  timezone: string;
  initiallyOpenType?: "EXPENSE" | "INCOME" | null;
  surface: ConsumerFinanceSurface;
}) {
  const client = useQueryClient();
  const t = financeCopy(locale);
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
        showCreateActions={false}
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

function DesktopTransactionTable({
  items,
  locale,
  timezone,
  onDetail,
  onEdit,
  onDelete,
}: {
  items: ConsumerFinanceTransaction[];
  locale: FinanceLocale;
  timezone: string;
  onDetail: (item: ConsumerFinanceTransaction) => void;
  onEdit: (item: ConsumerFinanceTransaction) => void;
  onDelete: (item: ConsumerFinanceTransaction) => void;
}) {
  const t = financeCopy(locale);
  return (
    <Table>
      <thead className="border-b border-neutral-700 text-xs uppercase text-neutral-500">
        <tr>
          <th className="px-3 py-2 font-medium">{t.description}</th>
          <th className="px-3 py-2 font-medium">{t.date}</th>
          <th className="px-3 py-2 font-medium">{t.account}</th>
          <th className="px-3 py-2 font-medium">{t.category}</th>
          <th className="px-3 py-2 text-right font-medium">{t.amount}</th>
          <th className="w-36 px-3 py-2" aria-label={t.edit} />
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-800">
        {items.map((item) => {
          const income = item.type === "INCOME";
          return (
            <tr key={item.id} className="hover:bg-neutral-800/40">
              <td className="max-w-80 px-3 py-2.5">
                <button
                  type="button"
                  className="block max-w-full truncate text-left text-sky-200 hover:underline"
                  onClick={() => onDetail(item)}
                >
                  {item.merchantDisplay ||
                    item.description ||
                    (income ? t.income : t.expense)}
                </button>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-neutral-400">
                {new Intl.DateTimeFormat(financeIntlLocale(locale), {
                  timeZone: timezone,
                }).format(new Date(item.occurredAt))}
              </td>
              <td className="px-3 py-2.5">
                {item.account?.iconPresentation.type === "unicode"
                  ? `${item.account.iconPresentation.value} `
                  : ""}
                {item.account?.name ?? t.accountFallback}
              </td>
              <td className="px-3 py-2.5 text-neutral-400">
                {item.category
                  ? `${item.category.iconPresentation.type === "unicode" ? `${item.category.iconPresentation.value} ` : ""}${localizeFinanceCategory(
                      item.category.name,
                      item.category.key,
                      locale,
                    )}`
                  : t.uncategorized}
              </td>
              <td
                className={`whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums ${income ? "text-emerald-300" : "text-rose-300"}`}
              >
                {income ? "+" : "−"}
                {formatMoney(item.amount, item.currency, "symbol")}
              </td>
              <td className="px-2 py-1.5">
                <div className="flex justify-end gap-1">
                  <RowAction
                    label={t.transactionDetails}
                    tone="text-sky-300"
                    onClick={() => onDetail(item)}
                  >
                    <List size={16} />
                  </RowAction>
                  <RowAction
                    label={t.editTransactionLabel}
                    tone="text-neutral-300"
                    onClick={() => onEdit(item)}
                  >
                    <Pencil size={16} />
                  </RowAction>
                  <RowAction
                    label={t.deleteTransactionLabel}
                    tone="text-rose-300"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 size={16} />
                  </RowAction>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function RowAction({
  label,
  tone,
  onClick,
  children,
}: {
  label: string;
  tone: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex min-h-9 min-w-9 items-center justify-center rounded outline-none hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-sky-300 ${tone}`}
    >
      {children}
    </button>
  );
}
