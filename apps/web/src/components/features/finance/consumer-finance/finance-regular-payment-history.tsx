"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { ConsumerFinanceRegularPayment } from "@telegram-system/shared";
import { Button, EmptyState, ErrorState, LoadingState, Modal } from "./ui";
import { consumerFinanceObligationsApi } from "@/lib/features/finance/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financeRegularPaymentsCopy } from "./i18n/regular-payments";
import { localizeFinanceCategory } from "./finance-category-i18n";

export function FinanceRegularPaymentHistory({
  botId,
  payment,
  locale,
  timezone,
  onClose,
}: {
  botId: string;
  payment: ConsumerFinanceRegularPayment;
  locale: FinanceLocale;
  timezone: string;
  onClose: () => void;
}) {
  const t = financeRegularPaymentsCopy(locale);
  const revisions = useInfiniteQuery({
    queryKey: consumerFinanceKeys.regularPaymentRevisions(botId, payment.id),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      consumerFinanceObligationsApi.regularPaymentRevisions(botId, payment.id, {
        cursor: pageParam,
        limit: 30,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = revisions.data?.pages.flatMap((page) => page.items) ?? [];
  const kindLabel = {
    CREATED: t.revisionCreated,
    UPDATED: t.revisionUpdated,
    PAUSED: t.revisionPaused,
    RESUMED: t.revisionResumed,
    CANCELED: t.revisionCanceled,
    AMOUNT_APPLIED: t.revisionAmountApplied,
  } as const;
  const statusLabel = {
    ACTIVE: t.active,
    PAUSED: t.paused,
    CANCELED: t.canceled,
  } as const;
  const recurrenceLabel = {
    WEEKLY: t.weekly,
    MONTHLY: t.monthly,
    YEARLY: t.yearly,
  } as const;
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t.close}
      title={t.historyTitle.replace("{name}", payment.name)}
    >
      {revisions.isLoading ? (
        <LoadingState text={t.loading} />
      ) : revisions.isError ? (
        <div className="space-y-3">
          <ErrorState text={t.paymentLoadError} />
          <Button onClick={() => revisions.refetch()}>{t.retry}</Button>
        </div>
      ) : items.length ? (
        <div className="divide-y divide-neutral-800">
          {items.map((revision) => (
            <div key={revision.id} className="py-3 text-sm">
              <div className="flex justify-between gap-3">
                <strong>{kindLabel[revision.kind]}</strong>
                <span className="text-neutral-400">v{revision.version}</span>
              </div>
              <p className="mt-1 font-medium text-neutral-200">
                {revision.name}
              </p>
              <p className="mt-1 text-neutral-300">
                {formatMoney(revision.amount, revision.currency, "symbol")} ·{" "}
                {revision.accountName}
              </p>
              <p className="mt-1 text-neutral-400">
                {recurrenceLabel[revision.recurrence]} · {t.scheduledFor}{" "}
                {new Intl.DateTimeFormat(financeIntlLocale(locale), {
                  timeZone: revision.scheduleTimezone,
                }).format(new Date(revision.nextOccurrenceAt))}
              </p>
              <p className="mt-1 text-neutral-400">
                {t.status}: {statusLabel[revision.status]} ·{" "}
                {t.categorySnapshot}:{" "}
                {revision.categoryName
                  ? localizeFinanceCategory(
                      revision.categoryName,
                      revision.categoryKey,
                      locale,
                    )
                  : t.noCategory}
              </p>
              <p className="mt-1 text-neutral-400">
                {t.noteSnapshot}: {revision.note ?? t.noNote}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {new Intl.DateTimeFormat(financeIntlLocale(locale), {
                  timeZone: timezone,
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(revision.effectiveAt))}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text={t.noHistory} />
      )}
      {revisions.hasNextPage ? (
        <Button
          className="mt-3 w-full"
          variant="secondary"
          disabled={revisions.isFetchingNextPage}
          onClick={() => revisions.fetchNextPage()}
        >
          {revisions.isFetchingNextPage ? t.loading : t.loadMore}
        </Button>
      ) : null}
    </Modal>
  );
}
