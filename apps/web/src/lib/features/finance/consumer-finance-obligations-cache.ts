import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceDebt,
  ConsumerFinanceDebtPage,
  ConsumerFinanceDebtQuery,
  ConsumerFinanceRegularPayment,
  ConsumerFinanceRegularPaymentPage,
  ConsumerFinanceRegularPaymentQuery,
} from "@telegram-system/shared";
import { consumerFinanceKeys } from "./consumer-finance-query-keys";

export function reconcileConsumerDebtPages(
  client: QueryClient,
  botId: string,
  debt: ConsumerFinanceDebt,
) {
  for (const [queryKey, data] of client.getQueriesData<
    InfiniteData<ConsumerFinanceDebtPage>
  >({ queryKey: consumerFinanceKeys.debtsRoot(botId) })) {
    if (!data || !isRecord(queryKey[3])) continue;
    const filters = queryKey[3] as ConsumerFinanceDebtQuery;
    reconcilePages(client, queryKey, data, debt, debtMatches(debt, filters));
  }
  void client.invalidateQueries({
    queryKey: consumerFinanceKeys.debtsRoot(botId),
  });
}

export function reconcileConsumerRegularPaymentPages(
  client: QueryClient,
  botId: string,
  payment: ConsumerFinanceRegularPayment,
) {
  for (const [queryKey, data] of client.getQueriesData<
    InfiniteData<ConsumerFinanceRegularPaymentPage>
  >({ queryKey: consumerFinanceKeys.regularPaymentsRoot(botId) })) {
    if (!data || !isRecord(queryKey[3])) continue;
    const filters = queryKey[3] as ConsumerFinanceRegularPaymentQuery;
    reconcilePages(
      client,
      queryKey,
      data,
      payment,
      regularPaymentMatches(payment, filters),
    );
  }
  void client.invalidateQueries({
    queryKey: consumerFinanceKeys.regularPaymentsRoot(botId),
  });
}

export async function invalidateConsumerFinanceLedgerReads(
  client: QueryClient,
  botId: string,
) {
  await Promise.all([
    client.invalidateQueries({ queryKey: consumerFinanceKeys.accounts(botId) }),
    client.invalidateQueries({
      queryKey: consumerFinanceKeys.transactionLists(botId),
    }),
    client.invalidateQueries({
      queryKey: consumerFinanceKeys.dashboard(botId),
    }),
    client.invalidateQueries({
      queryKey: consumerFinanceKeys.analyticsRoot(botId),
    }),
  ]);
}

function reconcilePages<T extends { id: string }, TPage extends { items: T[] }>(
  client: QueryClient,
  queryKey: readonly unknown[],
  data: InfiniteData<TPage>,
  item: T,
  matches: boolean,
) {
  const rows = data.pages.flatMap((page) => page.items);
  const existingIndex = rows.findIndex((row) => row.id === item.id);
  if (existingIndex >= 0) rows.splice(existingIndex, 1);
  if (matches) rows.unshift(item);
  let offset = 0;
  client.setQueryData(queryKey, {
    ...data,
    pages: data.pages.map((page, index) => {
      const size =
        index === data.pages.length - 1
          ? Math.max(0, rows.length - offset)
          : Math.min(page.items.length, rows.length - offset);
      const items = rows.slice(offset, offset + size);
      offset += size;
      return { ...page, items };
    }),
  });
}

function debtMatches(
  debt: ConsumerFinanceDebt,
  query: ConsumerFinanceDebtQuery,
) {
  return !query.status || debt.status === query.status;
}

function regularPaymentMatches(
  payment: ConsumerFinanceRegularPayment,
  query: ConsumerFinanceRegularPaymentQuery,
) {
  return (
    (!query.id || payment.id === query.id) &&
    (!query.status || payment.status === query.status)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
