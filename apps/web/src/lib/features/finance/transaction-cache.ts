import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceHistoryPage,
  ConsumerFinanceTransaction,
} from "@telegram-system/shared";
import type { Transaction } from "@/lib/api";
import { accountKeys, consumerFinanceKeys } from "@/lib/query-keys";

/** Removes a deleted transaction from every cached internal-finance list. */
export function removeTransactionFromCaches(queryClient: QueryClient, transactionId: string) {
  queryClient.setQueriesData<Transaction[]>(
    { queryKey: accountKeys.transactions() },
    (transactions) => transactions?.filter((transaction) => transaction.id !== transactionId),
  );
}

/** Restores the exact cache snapshots when an optimistic deletion fails. */
export function restoreTransactionCacheSnapshots(
  queryClient: QueryClient,
  snapshots: ReturnType<QueryClient["getQueriesData"]>,
) {
  for (const [queryKey, data] of snapshots) queryClient.setQueryData(queryKey, data);
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
  queryClient.setQueriesData<InfiniteData<ConsumerFinanceHistoryPage>>(
    { queryKey: consumerFinanceKeys.transactionLists(botId) },
    (history) => history && {
      ...history,
      pages: history.pages.map((page) => ({
        ...page,
        items: page.items.filter((transaction) => transaction.id !== transactionId),
      })),
    },
  );
}

export function prependConsumerTransactionToCaches(
  queryClient: QueryClient,
  botId: string,
  transaction: ConsumerFinanceTransaction,
) {
  queryClient.setQueriesData<InfiniteData<ConsumerFinanceHistoryPage>>(
    { queryKey: consumerFinanceKeys.transactionLists(botId) },
    (history) => history && {
      ...history,
      pages: history.pages.map((page, index) => index === 0
        ? { ...page, items: [transaction, ...page.items.filter((item) => item.id !== transaction.id)] }
        : page),
    },
  );
}
