"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { transactionsApi } from "@/lib/api";
import { accountKeys } from "@/lib/query-keys";
import {
  getTransactionCacheSnapshots,
  removeTransactionFromCaches,
  restoreTransactionCacheSnapshots,
} from "./transaction-cache";

/** Deletes locally first, so a successful request never waits for a list reload. */
export function useDeleteTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => transactionsApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: accountKeys.transactions() });
      const snapshots = getTransactionCacheSnapshots(queryClient);
      removeTransactionFromCaches(queryClient, id);
      return { snapshots };
    },
    onError: (_error, _id, context) => {
      if (context) restoreTransactionCacheSnapshots(queryClient, context.snapshots);
    },
    onSuccess: () => {
      // The list is already reconciled locally. Mark hidden variants stale without refetching this page.
      void queryClient.invalidateQueries({ queryKey: accountKeys.transactions(), refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: accountKeys.accounts() });
    },
  });
}
