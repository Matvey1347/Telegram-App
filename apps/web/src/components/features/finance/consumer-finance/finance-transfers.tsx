"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceTransfer,
  ConsumerFinanceTransferQuery,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  DateRangeInput,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { formatMoney } from "@/lib/features/finance/money";
import {
  reconcileConsumerTransferCaches,
  removeConsumerTransferFromCaches,
} from "@/lib/features/finance/transfer-cache";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { FinanceTransferEditor } from "./finance-transfer-editor";
import { useDebouncedValue } from "./use-debounced-value";
import {
  financeCopy,
  financeIntlLocale,
  type FinanceLocale,
} from "./finance-i18n";

export function FinanceTransfers({
  botId,
  accounts,
  locale,
  timezone,
  initiallyOpen = false,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  locale: FinanceLocale;
  timezone: string;
  initiallyOpen?: boolean;
}) {
  const client = useQueryClient();
  const t = financeCopy(locale);
  const [filters, setFilters] = useState<ConsumerFinanceTransferQuery>({
    limit: 30,
  });
  const [editing, setEditing] = useState<ConsumerFinanceTransfer | null>(null);
  const [deleting, setDeleting] = useState<ConsumerFinanceTransfer | null>(
    null,
  );
  const debouncedSearch = useDebouncedValue(filters.search);
  const queryFilters = { ...filters, search: debouncedSearch };
  const history = useInfiniteQuery({
    queryKey: consumerFinanceKeys.transfers(botId, {
      ...queryFilters,
      cursor: undefined,
    }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      consumerFinanceApi.transfers(botId, {
        ...queryFilters,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const invalidateDerived = () => {
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.accounts(botId),
    });
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.dashboard(botId),
    });
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.analyticsRoot(botId),
    });
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.ultimateRoot(botId),
    });
  };
  const remove = useMutation({
    mutationFn: (id: string) => consumerFinanceApi.deleteTransfer(botId, id),
    onSuccess: (_, id) => {
      removeConsumerTransferFromCaches(client, botId, id);
      setDeleting(null);
      invalidateDerived();
    },
  });
  const update = (changes: Partial<ConsumerFinanceTransferQuery>) =>
    setFilters((current) => ({ ...current, ...changes, cursor: undefined }));
  return (
    <div className="space-y-4">
      <FinanceTransferEditor
        key={editing?.id ?? "create-transfer"}
        botId={botId}
        accounts={accounts}
        locale={locale}
        timezone={timezone}
        editing={editing}
        initiallyOpen={initiallyOpen}
        onClose={() => setEditing(null)}
        onSaved={(item) => {
          reconcileConsumerTransferCaches(client, botId, item, timezone);
          setEditing(null);
          invalidateDerived();
        }}
      />
      <Card>
        <div className="grid grid-cols-2 gap-2">
          <Input
            className="col-span-2"
            aria-label={t.searchTransfers}
            placeholder={t.transferSearchPlaceholder}
            value={filters.search ?? ""}
            onChange={(event) =>
              update({ search: event.target.value || undefined })
            }
          />
          <Select
            uiLocale={locale}
            className="col-span-2"
            aria-label={t.account}
            value={filters.accountId ?? ""}
            onChange={(event) =>
              update({ accountId: event.target.value || undefined })
            }
          >
            <option value="">{t.allAccounts}</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <DateRangeInput
            uiLocale={locale}
            from={filters.from}
            to={filters.to}
            onChange={({ from, to }) =>
              update({ from: from || undefined, to: to || undefined })
            }
          />
          <Button
            variant="secondary"
            className="col-span-2"
            onClick={() => setFilters({ limit: 30 })}
          >
            {t.clearFilters}
          </Button>
        </div>
      </Card>
      <Card>
        {history.isLoading ? (
          <LoadingState text={t.loading} />
        ) : history.isError ? (
          <div className="space-y-3">
            <ErrorState text={t.transferLoadError} />
            <Button onClick={() => history.refetch()}>{t.retry}</Button>
          </div>
        ) : items.length ? (
          items.map((item) => (
            <TransferRow
              key={item.id}
              item={item}
              locale={locale}
              timezone={timezone}
              onEdit={() => setEditing(item)}
              onDelete={() => setDeleting(item)}
            />
          ))
        ) : (
          <EmptyState text={t.noTransfers} />
        )}
      </Card>
      {history.hasNextPage ? (
        <Button
          className="w-full"
          variant="secondary"
          disabled={history.isFetchingNextPage}
          onClick={() => history.fetchNextPage()}
        >
          {history.isFetchingNextPage ? t.loading : t.loadMore}
        </Button>
      ) : null}
      {remove.isError ? (
        <p className="text-sm text-rose-300">{t.transferDeleteError}</p>
      ) : null}
      <FinanceConfirmModal
        open={!!deleting}
        locale={locale}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? remove.mutateAsync(deleting.id) : Promise.resolve()
        }
        entityName={deleting?.description || t.transferFallback}
        actionLabel={t.delete}
        description={t.deleteTransferDescription}
      />
    </div>
  );
}

function TransferRow({
  item,
  locale,
  timezone,
  onEdit,
  onDelete,
}: {
  item: ConsumerFinanceTransfer;
  locale: FinanceLocale;
  timezone: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = financeCopy(locale);
  return (
    <div className="flex items-center gap-1 border-b border-neutral-800 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {item.description ||
            `${item.fromAccount.name} → ${item.toAccount.name}`}
        </p>
        <p className="text-xs text-neutral-500">
          {item.fromAccount.name} → {item.toAccount.name} ·{" "}
          {new Intl.DateTimeFormat(financeIntlLocale(locale), {
            timeZone: timezone,
          }).format(new Date(item.occurredAt))}
        </p>
        <p className="text-xs text-neutral-500">
          {formatMoney(item.fromAmount, item.fromCurrency, "symbol")} →{" "}
          {formatMoney(item.toAmount, item.toCurrency, "symbol")}
        </p>
      </div>
      <button
        aria-label={t.editTransfer}
        className="flex min-h-11 min-w-11 items-center justify-center rounded text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
        onClick={onEdit}
      >
        <Pencil size={16} />
      </button>
      <button
        aria-label={t.deleteTransferLabel}
        className="flex min-h-11 min-w-11 items-center justify-center rounded text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
        onClick={onDelete}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
