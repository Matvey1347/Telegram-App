export type FinanceTransactionType = "income" | "expense";

export type FinanceCategoryCurrencyStatistics = {
  currency: string;
  amount: string;
  amountInPrimaryCurrency: string;
};

export type FinanceCategoryStatisticsItem = {
  categoryId: string | null;
  categoryName: string | null;
  count: number;
  totalInPrimaryCurrency: string;
  currencies: FinanceCategoryCurrencyStatistics[];
};

export type FinanceCategoryStatisticsResponse = {
  type: FinanceTransactionType;
  items: FinanceCategoryStatisticsItem[];
};
