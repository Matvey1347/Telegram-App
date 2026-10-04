"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { ConsumerFinanceSavingsGoal } from "@telegram-system/shared";
import { Button, EmptyState, ErrorState, LoadingState, Modal } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeSavingsCopy } from "./i18n/savings";
import { financeIntlLocale } from "./i18n/core";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { consumerFinanceSavingsGoalsApi } from "@/lib/features/finance/consumer-finance-savings-goals-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";

export function FinanceSavingsHistory({
  botId,
  goal,
  locale,
  open,
  onClose,
}: {
  botId: string;
  goal: ConsumerFinanceSavingsGoal;
  locale: FinanceLocale;
  open: boolean;
  onClose: () => void;
}) {
  const t = financeSavingsCopy(locale);
  const query = useInfiniteQuery({
    queryKey: consumerFinanceKeys.savingsHistory(botId, goal.id),
    queryFn: ({ pageParam }) =>
      consumerFinanceSavingsGoalsApi.history(botId, goal.id, {
        cursor: pageParam,
        limit: 30,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: open,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Modal open={open} onClose={onClose} title={`${t.history}: ${goal.name}`}>
      {query.isLoading ? (
        <LoadingState text={t.loading} />
      ) : query.isError ? (
        <div className="space-y-2">
          <ErrorState text={t.loadError} />
          <Button variant="secondary" onClick={() => query.refetch()}>
            {t.retry}
          </Button>
        </div>
      ) : items.length ? (
        <div className="space-y-1">
          {items.map((item) => {
            const label =
              item.kind === "ALLOCATE"
                ? t.historyAllocate
                : item.kind === "RELEASE"
                  ? t.historyRelease
                  : t.historyMove;
            return (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 border-b border-neutral-800 py-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-neutral-500">
                    {item.account?.name ?? t.account} ·{" "}
                    {new Intl.DateTimeFormat(financeIntlLocale(locale)).format(
                      new Date(item.occurredAt),
                    )}
                  </p>
                  {item.note ? (
                    <p className="mt-1 text-xs text-neutral-400">{item.note}</p>
                  ) : null}
                  {item.linkedTransferId ? (
                    <p className="mt-1 text-xs text-sky-300">
                      {t.transferLink}: {item.linkedTransferId}
                    </p>
                  ) : null}
                </div>
                <strong className="shrink-0 text-sm tabular-nums">
                  {formatMoney(item.amount, item.currency, "symbol")}
                </strong>
              </div>
            );
          })}
          {query.hasNextPage ? (
            <Button
              variant="secondary"
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {t.loadMore}
            </Button>
          ) : null}
        </div>
      ) : (
        <EmptyState text={t.movementEmpty} />
      )}
    </Modal>
  );
}
