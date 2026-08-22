import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceHistoryPage,
  ConsumerFinanceHistoryQuery,
  ConsumerFinanceTransaction,
  ConsumerFinanceTransfer,
  ConsumerFinanceTransferPage,
  ConsumerFinanceTransferQuery,
} from "@telegram-system/shared";
import { financeHistoryDateMatches } from "./consumer-finance-date";
import { consumerFinanceKeys } from "./consumer-finance-query-keys";

export function removeConsumerTransactionFromCaches(
  client: QueryClient,
  botId: string,
  id: string,
) {
  client.removeQueries({
    queryKey: consumerFinanceKeys.transaction(botId, id),
    exact: true,
  });
  client.setQueriesData<InfiniteData<ConsumerFinanceHistoryPage>>(
    { queryKey: consumerFinanceKeys.transactionLists(botId) },
    (history) =>
      history && {
        ...history,
        pages: history.pages.map((page) => ({
          ...page,
          items: page.items.filter((item) => item.id !== id),
        })),
      },
  );
}

export function prependConsumerTransactionToCaches(
  client: QueryClient,
  botId: string,
  transaction: ConsumerFinanceTransaction,
  timezone = "UTC",
) {
  reconcileConsumerTransactionCaches(client, botId, transaction, timezone);
}

export function reconcileConsumerTransactionCaches(
  client: QueryClient,
  botId: string,
  transaction: ConsumerFinanceTransaction,
  timezone = "UTC",
) {
  client.setQueryData(
    consumerFinanceKeys.transaction(botId, transaction.id),
    transaction,
  );
  for (const [queryKey, history] of client.getQueriesData<
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
    client.setQueryData<InfiniteData<ConsumerFinanceHistoryPage>>(queryKey, {
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
    });
  }
}

export function reconcileConsumerTransferCaches(
  client: QueryClient,
  botId: string,
  transfer: ConsumerFinanceTransfer,
  timezone = "UTC",
) {
  for (const [queryKey, data] of client.getQueriesData<
    InfiniteData<ConsumerFinanceTransferPage>
  >({ queryKey: consumerFinanceKeys.transferLists(botId) })) {
    if (!data) continue;
    const filters = (queryKey[3] ?? {}) as ConsumerFinanceTransferQuery;
    const matches = transferMatchesFilters(transfer, filters, timezone);
    const ordered = data.pages
      .flatMap((page) => page.items)
      .filter((item) => item.id !== transfer.id);
    if (matches) ordered.push(transfer);
    ordered.sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) ||
        right.id.localeCompare(left.id),
    );
    let offset = 0;
    client.setQueryData<InfiniteData<ConsumerFinanceTransferPage>>(queryKey, {
      ...data,
      pages: data.pages.map((page, index) => {
        const size =
          index === data.pages.length - 1
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
    });
  }
}

export function removeConsumerTransferFromCaches(
  client: QueryClient,
  botId: string,
  id: string,
) {
  client.setQueriesData<InfiniteData<ConsumerFinanceTransferPage>>(
    { queryKey: consumerFinanceKeys.transferLists(botId) },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.filter((item) => item.id !== id),
        })),
      },
  );
}

function transactionMatchesFilters(
  item: ConsumerFinanceTransaction,
  filters: ConsumerFinanceHistoryQuery,
  timezone: string,
) {
  if (filters.type && item.type !== filters.type) return false;
  if (filters.accountId && item.accountId !== filters.accountId) return false;
  if (filters.categoryId && item.categoryId !== filters.categoryId)
    return false;
  if (
    !financeHistoryDateMatches(
      item.occurredAt,
      filters.from,
      filters.to,
      timezone,
    )
  ) {
    return false;
  }
  if (filters.search) {
    const search = filters.search.toLocaleLowerCase();
    const text =
      `${item.description ?? ""} ${item.category?.name ?? ""}`.toLocaleLowerCase();
    if (!text.includes(search)) return false;
  }
  return true;
}

function transferMatchesFilters(
  item: ConsumerFinanceTransfer,
  filters: ConsumerFinanceTransferQuery,
  timezone: string,
) {
  if (
    filters.accountId &&
    item.fromAccountId !== filters.accountId &&
    item.toAccountId !== filters.accountId
  ) {
    return false;
  }
  if (
    !financeHistoryDateMatches(
      item.occurredAt,
      filters.from,
      filters.to,
      timezone,
    )
  ) {
    return false;
  }
  return (
    !filters.search ||
    (item.description ?? "")
      .toLocaleLowerCase()
      .includes(filters.search.toLocaleLowerCase())
  );
}
