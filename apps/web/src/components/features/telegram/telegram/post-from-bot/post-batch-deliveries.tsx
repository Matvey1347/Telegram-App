"use client";

import { RefreshCw } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { TelegramPostBatchDelivery } from "@telegram-system/shared";
import { Button, EmptyState, LoadingState } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { telegramPostBatchKeys } from "@/lib/query-keys";
import { telegramPostBatchesApi } from "@/lib/features/telegram/telegram-post-batches-api";
import { useI18n, type TranslationFunction } from "@/providers/i18n-provider";
import { useVisibilityClock } from "./use-visibility-clock";

export function deletionLabel(
  delivery: TelegramPostBatchDelivery,
  now: number,
  locale: "en" | "ru",
  t: TranslationFunction,
) {
  if (!delivery.deleteAt) return t("telegram.posts.batch.permanent");
  if (delivery.deletedAt || delivery.status === "DELETED")
    return t("telegram.posts.batch.deleted");
  const remaining = new Date(delivery.deleteAt).getTime() - now;
  if (!Number.isFinite(remaining)) return t("telegram.posts.batch.deletionDue");
  if (remaining <= 0) return t("telegram.posts.batch.deletionDue");
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  const value = minutes >= 60 ? Math.ceil(minutes / 60) : minutes;
  const unit = minutes >= 60 ? "hour" : "minute";
  return t("telegram.posts.batch.deletesIn", {
    time: new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(
      value,
      unit,
    ),
  });
}

export function PostBatchDeliveries({ batchId }: { batchId: string }) {
  const { locale, t } = useI18n();
  const pagination = usePagination({ initialPageSize: 10 });
  const now = useVisibilityClock();
  const query = useQuery({
    queryKey: telegramPostBatchKeys.deliveries(batchId, {
      page: pagination.page,
      pageSize: pagination.pageSize,
    }),
    queryFn: () =>
      telegramPostBatchesApi.deliveries(batchId, {
        page: pagination.page,
        pageSize: pagination.pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="font-medium text-white">
            {t("telegram.posts.batch.deliveries")}
          </h4>
          <p className="text-xs text-neutral-500">
            {t("telegram.posts.batch.manualRefreshHint")}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          aria-label={t("telegram.posts.batch.refreshDeliveries")}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            size={16}
            className={query.isFetching ? "animate-spin" : ""}
          />
          {t("common.refresh")}
        </Button>
      </div>

      {query.isLoading ? <LoadingState /> : null}
      {query.error ? (
        <p
          role="alert"
          className="rounded-lg bg-rose-950/30 p-3 text-sm text-rose-200"
        >
          {t("telegram.posts.batch.deliveriesError")}
        </p>
      ) : null}
      {query.data && !query.data.items.length ? (
        <EmptyState text={t("telegram.posts.batch.noDeliveries")} />
      ) : null}
      {query.data?.items.length ? (
        <div className="space-y-2">
          {query.data.items.map((delivery) => (
            <article
              key={delivery.id}
              className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-100">
                  {delivery.postTitle} · {delivery.telegramChannel.title}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {t("telegram.posts.batch.deliveryStatus", {
                    status: delivery.status,
                    remote: delivery.telegramRemoteStatus,
                  })}
                  {delivery.lastError ? ` · ${delivery.lastError}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                  {deletionLabel(delivery, now, locale, t)}
                </span>
                {delivery.telegramMessageUrls[0] ? (
                  <a
                    href={delivery.telegramMessageUrls[0]}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-blue-300 hover:text-blue-200"
                  >
                    {t("telegram.posts.batch.openTelegram")}
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {query.data ? (
        <Pagination
          page={query.data.pagination.page}
          pageSize={query.data.pagination.pageSize}
          totalItems={query.data.pagination.totalItems}
          totalPages={query.data.pagination.totalPages}
          hasNextPage={
            query.data.pagination.page < query.data.pagination.totalPages
          }
          hasPreviousPage={query.data.pagination.page > 1}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          loading={query.isFetching}
          pageSizeOptions={[10, 25, 50]}
        />
      ) : null}
    </section>
  );
}
