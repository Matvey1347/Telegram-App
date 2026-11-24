"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { Pagination } from "@/components/ui/pagination";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/primitives";
import { investmentsApi } from "@/lib/api";
import { formatDate } from "@/lib/date-format";
import { accountKeys } from "@/lib/query-keys";
import { useI18n } from "@/providers/i18n-provider";

export function FinanceInvestmentsPage() {
  return <AppShell><InvestmentList /></AppShell>;
}

function InvestmentList() {
  const { locale } = useI18n();
  const russian = locale === "ru";
  const [params, setParams] = useState({ page: 1, pageSize: 10 });
  const query = useQuery({
    queryKey: [...accountKeys.investments(), params],
    queryFn: () => investmentsApi.listPage(params),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title={russian ? "Инвестиции" : "Investments"}
        subtitle={russian ? "Взносы и вывод капитала" : "Capital contributions and withdrawals"}
        action={<Link href="/finance" className="min-h-9 items-center justify-center rounded-lg border border-neutral-700 px-3 text-sm font-medium hover:bg-neutral-800">{russian ? "Финансы" : "Finance"}</Link>}
      />
      {query.isPending ? <LoadingState /> : null}
      {query.isError ? <ErrorState text={russian ? "Не удалось загрузить инвестиции" : "Could not load investments"} /> : null}
      {query.data ? (
        <>
          {query.data.items.length === 0 ? (
            <EmptyState text={russian ? "Инвестиционных операций пока нет" : "No investment movements"} />
          ) : (
            <Card className="divide-y divide-neutral-800">
              {query.data.items.map((item) => {
                const withdrawal = item.movementType === "WITHDRAWAL";
                return (
                  <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="break-words font-medium text-white">{item.notes || (withdrawal ? (russian ? "Вывод" : "Withdrawal") : (russian ? "Взнос" : "Contribution"))}</div>
                      <div className="text-xs text-neutral-400">
                        {[item.workspaceMember?.user.name, item.account?.name, formatDate(item.date)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <CurrencyAmount
                      amount={withdrawal ? -Math.abs(Number(item.amount)) : item.amount}
                      currency={item.currency}
                      className="text-right font-semibold tabular-nums"
                    />
                  </div>
                );
              })}
            </Card>
          )}
          <Pagination
            {...query.data.pagination}
            loading={query.isFetching}
            onPageChange={(page) => setParams((previous) => ({ ...previous, page }))}
            onPageSizeChange={(pageSize) => setParams({ page: 1, pageSize })}
          />
        </>
      ) : null}
    </>
  );
}
