import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { PaginationParams, TransactionQuery } from "@/lib/api";
import { financeOverviewQuery } from "@/lib/features/finance/finance-overview-query";
import {
  resizeFinanceListPage,
  type FinancePageState,
} from "./finance-overview-pagination";

type Period = { from: string; to: string };

export function useResponsiveFinanceListPages(
  setTransactionPage: Dispatch<SetStateAction<FinancePageState>>,
  setTransferPage: Dispatch<SetStateAction<FinancePageState>>,
) {
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const resize = () => {
      setTransactionPage((page) => resizeFinanceListPage(page, media.matches));
      setTransferPage((page) => resizeFinanceListPage(page, media.matches));
    };
    resize();
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, [setTransactionPage, setTransferPage]);
}

export function useFinanceTransactionFilters(
  period: Period,
  page: FinancePageState,
  setPage: Dispatch<SetStateAction<FinancePageState>>,
) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [search]);

  const query = useMemo<TransactionQuery & PaginationParams>(
    () => ({
      ...financeOverviewQuery(period, page),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(accountId ? { accountId } : {}),
      ...(categoryId ? { categoryId } : {}),
    }),
    [accountId, categoryId, debouncedSearch, page, period],
  );
  const resetPage = () => setPage((current) => ({ ...current, page: 1 }));

  return {
    query,
    search,
    accountId,
    categoryId,
    setSearch: (value: string) => {
      setSearch(value);
      resetPage();
    },
    setAccountId: (value: string) => {
      setAccountId(value);
      resetPage();
    },
    setCategoryId: (value: string) => {
      setCategoryId(value);
      resetPage();
    },
  };
}
