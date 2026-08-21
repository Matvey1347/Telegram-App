import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceTransfer,
  ConsumerFinanceTransferPage,
  ConsumerFinanceTransferQuery,
} from "@telegram-system/shared";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { financeHistoryDateMatches } from "./finance-date";

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

function transferMatchesFilters(
  transfer: ConsumerFinanceTransfer,
  filters: ConsumerFinanceTransferQuery,
  timezone: string,
) {
  if (
    filters.accountId &&
    transfer.fromAccountId !== filters.accountId &&
    transfer.toAccountId !== filters.accountId
  )
    return false;
  if (
    !financeHistoryDateMatches(
      transfer.occurredAt,
      filters.from,
      filters.to,
      timezone,
    )
  )
    return false;
  if (
    filters.search &&
    !(transfer.description ?? "")
      .toLocaleLowerCase()
      .includes(filters.search.toLocaleLowerCase())
  )
    return false;
  return true;
}
