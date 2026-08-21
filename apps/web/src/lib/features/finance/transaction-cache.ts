import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceHistoryQuery,
  ConsumerFinanceHistoryPage,
  ConsumerFinanceTransaction,
} from "@telegram-system/shared";
import type { Transaction } from "@/lib/api";
import { financeHistoryDateMatches } from "@/lib/features/finance/finance-date";
import { accountKeys, consumerFinanceKeys } from "@/lib/query-keys";

/** Removes a deleted transaction from every cached internal-finance list. */
export function removeTransactionFromCaches(
  queryClient: QueryClient,
  transactionId: string,
) {
  queryClient.setQueriesData<Transaction[]>(
    { queryKey: accountKeys.transactions() },
    (transactions) =>
      transactions?.filter((transaction) => transaction.id !== transactionId),
  );
}

/** Restores the exact cache snapshots when an optimistic deletion fails. */
export function restoreTransactionCacheSnapshots(
  queryClient: QueryClient,
  snapshots: ReturnType<QueryClient["getQueriesData"]>,
) {
  for (const [queryKey, data] of snapshots)
    queryClient.setQueryData(queryKey, data);
}

export function getTransactionCacheSnapshots(queryClient: QueryClient) {
  return queryClient.getQueriesData({ queryKey: accountKeys.transactions() });
}

/** Keeps every loaded Mini App history page consistent without reloading it. */
export function removeConsumerTransactionFromCaches(
  queryClient: QueryClient,
  botId: string,
  transactionId: string,
) {
  queryClient.removeQueries({
    queryKey: consumerFinanceKeys.transaction(botId, transactionId),
    exact: true,
  });
  queryClient.setQueriesData<InfiniteData<ConsumerFinanceHistoryPage>>(
    { queryKey: consumerFinanceKeys.transactionLists(botId) },
    (history) =>
      history && {
        ...history,
        pages: history.pages.map((page) => ({
          ...page,
          items: page.items.filter(
            (transaction) => transaction.id !== transactionId,
          ),
        })),
      },
  );
}

export function prependConsumerTransactionToCaches(
  queryClient: QueryClient,
  botId: string,
  transaction: ConsumerFinanceTransaction,
  timezone = "UTC",
) {
  reconcileConsumerTransactionCaches(queryClient, botId, transaction, timezone);
}

/** Replaces an edited row in every loaded list, or prepends a newly created row. */
export function reconcileConsumerTransactionCaches(
  queryClient: QueryClient,
  botId: string,
  transaction: ConsumerFinanceTransaction,
  timezone = "UTC",
) {
  queryClient.setQueryData(
    consumerFinanceKeys.transaction(botId, transaction.id),
    transaction,
  );
  for (const [queryKey, history] of queryClient.getQueriesData<
    InfiniteData<ConsumerFinanceHistoryPage>
  >({ queryKey: consumerFinanceKeys.transactionLists(botId) })) {
    if (!history) continue;
    const filters = (queryKey[3] ?? {}) as ConsumerFinanceHistoryQuery;
    const matches = transactionMatchesFilters(transaction, filters, timezone);
    const ordered = history.pages
      .flatMap((page) => page.items)
      .filter((item) => item.id !== transaction.id);
    if (matches) ordered.push(transaction);
    ordered.sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) ||
        right.id.localeCompare(left.id),
    );
    let offset = 0;
    queryClient.setQueryData<InfiniteData<ConsumerFinanceHistoryPage>>(
      queryKey,
      {
        ...history,
        pages: history.pages.map((page, index) => {
          const size =
            index === history.pages.length - 1
              ? ordered.length - offset
              : Math.min(page.items.length, ordered.length - offset);
          const items = ordered.slice(offset, offset + size);
          offset += size;
          return {
            ...page,
            items,
            nextCursor: page.nextCursor ? (items.at(-1)?.id ?? null) : null,
          };
        }),
      },
    );
  }
}

function transactionMatchesFilters(
  transaction: ConsumerFinanceTransaction,
  filters: ConsumerFinanceHistoryQuery,
  timezone: string,
) {
  if (filters.type && transaction.type !== filters.type) return false;
  if (filters.accountId && transaction.accountId !== filters.accountId)
    return false;
  if (filters.categoryId && transaction.categoryId !== filters.categoryId)
    return false;
  if (
    !financeHistoryDateMatches(
      transaction.occurredAt,
      filters.from,
      filters.to,
      timezone,
    )
  )
    return false;
  if (filters.search) {
    const search = filters.search.toLocaleLowerCase();
    const haystack =
      `${transaction.description ?? ""} ${transaction.category?.name ?? ""}`.toLocaleLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}
