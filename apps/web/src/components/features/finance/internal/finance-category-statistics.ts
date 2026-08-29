import type { FinanceCategoryStatisticsResponse } from "@telegram-system/shared";

export type FinanceCategoryPresentationStatistics = {
  count: number;
  totalPrimary: number;
  transactions: Array<{
    amount: number;
    currency: string;
    amountInPrimaryCurrency: number;
  }>;
};

export function mapFinanceCategoryStatistics(
  response?: FinanceCategoryStatisticsResponse,
) {
  const statistics = new Map<string, FinanceCategoryPresentationStatistics>();
  for (const item of response?.items ?? []) {
    statistics.set(item.categoryId ?? "uncategorized", {
      count: item.count,
      totalPrimary: Number(item.totalInPrimaryCurrency),
      transactions: item.currencies.map((currency) => ({
        amount: Number(currency.amount),
        currency: currency.currency,
        amountInPrimaryCurrency: Number(currency.amountInPrimaryCurrency),
      })),
    });
  }
  return statistics;
}
