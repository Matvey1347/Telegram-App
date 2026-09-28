import type { QueryClient } from "@tanstack/react-query";
import type { PaginatedResponse } from "@telegram-system/shared";
import type { Account, Transaction, Transfer } from "@/lib/api";
import { accountKeys } from "@/lib/query-keys";

function mergeAccount(current: Account, update: Account): Account {
  return {
    ...current,
    ...update,
    // The account mutation read model intentionally does not recalculate a
    // balance. Keep the already-loaded aggregate until a money movement occurs.
    balance: update.balance ?? current.balance,
    calculatedBalance: update.calculatedBalance ?? current.calculatedBalance,
    convertedBalance: update.convertedBalance ?? current.convertedBalance,
    convertedCurrency: update.convertedCurrency ?? current.convertedCurrency,
    transactionStats: update.transactionStats ?? current.transactionStats,
  };
}

function patchAccount(account: Account, update: Account) {
  return account.id === update.id ? mergeAccount(account, update) : account;
}

function patchCollection<T>(
  data: T[] | PaginatedResponse<T> | undefined,
  patch: (item: T) => T,
) {
  if (!data) return data;
  if (Array.isArray(data)) return data.map(patch);
  return { ...data, items: data.items.map(patch) };
}

/**
 * Updates all already-rendered internal Finance references after editing an
 * account’s presentation or ownership. No list refetch is needed for this
 * local, non-financial change.
 */
export function patchFinanceAccountCache(
  queryClient: QueryClient,
  update: Account,
) {
  queryClient.setQueriesData<Account[] | PaginatedResponse<Account>>(
    { queryKey: accountKeys.accounts() },
    (accounts) =>
      patchCollection(accounts, (account) => patchAccount(account, update)),
  );
  queryClient.setQueriesData<
    Transaction[] | PaginatedResponse<Transaction>
  >(
    { queryKey: accountKeys.transactions() },
    (transactions) =>
      patchCollection(transactions, (transaction) =>
        transaction.account?.id === update.id
          ? { ...transaction, account: mergeAccount(transaction.account, update) }
          : transaction,
      ),
  );
  queryClient.setQueriesData<Transfer[] | PaginatedResponse<Transfer>>(
    { queryKey: ["transfers"] },
    (transfers) =>
      patchCollection(transfers, (transfer) => ({
        ...transfer,
        fromAccount:
          transfer.fromAccount?.id === update.id
            ? mergeAccount(transfer.fromAccount, update)
            : transfer.fromAccount,
        toAccount:
          transfer.toAccount?.id === update.id
            ? mergeAccount(transfer.toAccount, update)
            : transfer.toAccount,
      })),
  );
}
