import type { TransactionQuery, TransferQuery } from "./finance-api";
import type { PaginationParams } from "../../api-types";

export const FINANCE_OVERVIEW_PAGE_SIZE = 10;

export function financeOverviewQuery(period: { from: string; to: string }, pagination: PaginationParams = {}): (TransactionQuery | TransferQuery) & PaginationParams {
  return {
    ...(period.from ? { dateFrom: period.from } : {}),
    ...(period.to ? { dateTo: period.to } : {}),
    sort: "date_desc",
    page: pagination.page ?? 1,
    pageSize: pagination.pageSize ?? FINANCE_OVERVIEW_PAGE_SIZE,
  };
}
