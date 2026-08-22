import type { QueryClient } from "@tanstack/react-query";
import type { Transaction } from "@/lib/api";
import { accountKeys } from "@/lib/query-keys";

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

export function restoreTransactionCacheSnapshots(
  queryClient: QueryClient,
  snapshots: ReturnType<QueryClient["getQueriesData"]>,
) {
  for (const [queryKey, data] of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function getTransactionCacheSnapshots(queryClient: QueryClient) {
  return queryClient.getQueriesData({ queryKey: accountKeys.transactions() });
}
