"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeftRight, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  ConsumerFinanceDashboard,
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
} from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import {
  reconcileConsumerTransferCaches,
  removeConsumerTransferFromCaches,
} from "@/lib/features/finance/consumer-finance-cache";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { FinanceTransferEditor } from "./finance-transfer-editor";
import { useDebouncedValue } from "./use-debounced-value";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financeTransfersCopy } from "./i18n/transfers";

export function FinanceTransfers({
  botId,
  locale,
  timezone,
  initiallyOpen = false,
  onCreateAccount,
}: {
  botId: string;
  locale: FinanceLocale;
  timezone: string;
  initiallyOpen?: boolean;
  onCreateAccount: () => void;
}) {
  const client = useQueryClient();
  const t = financeTransfersCopy(locale);
  const [filters, setFilters] = useState<ConsumerFinanceTransferQuery>({
    limit: 30,
  });
  const [editing, setEditing] = useState<ConsumerFinanceTransfer | null>(null);
  const [deleting, setDeleting] = useState<ConsumerFinanceTransfer | null>(
    null,
  );
  const debouncedSearch = useDebouncedValue(filters.search);
  const queryFilters = { ...filters, search: debouncedSearch };
  // Accounts and history are independent and intentionally start together.
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
    initialData: () =>
      client.getQueryData<ConsumerFinanceDashboard>(
        consumerFinanceKeys.dashboard(botId),
      )?.stats.accounts,
    initialDataUpdatedAt: () =>
      client.getQueryState(consumerFinanceKeys.dashboard(botId))?.dataUpdatedAt,
  });
  const accountRows = accounts.data ?? [];
  const activeAccounts = accountRows.filter((account) => !account.archivedAt);
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
    enabled: accounts.isSuccess && activeAccounts.length >= 2,
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
  if (accounts.isLoading)
    return <LoadingState text={t.loadingReferences} context="transfers" />;
  if (accounts.isError)
    return (
      <div className="space-y-3">
        <ErrorState text={t.referencesUnavailable} context="transfers" />
        <Button onClick={() => accounts.refetch()}>{t.retry}</Button>
      </div>
    );
  if (activeAccounts.length < 2)
    return (
      <Card className="mx-auto flex max-w-2xl flex-col items-center px-5 py-10 text-center sm:px-8 sm:py-12">
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-800/70 bg-sky-500/10 text-sky-200">
          <ArrowLeftRight size={28} aria-hidden="true" />
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-800 bg-neutral-950 text-xs font-semibold text-neutral-300">
            {activeAccounts.length}/2
          </span>
        </span>
        <h2 className="mt-5 text-lg font-semibold text-neutral-100">
          {t.transferUnavailable}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-neutral-400">
          {activeAccounts.length
            ? t.secondAccountRequired
            : t.firstAccountRequired}
        </p>
        <Button className="mt-6 min-h-11" onClick={onCreateAccount}>
          <Plus size={17} aria-hidden="true" />
          {activeAccounts.length ? t.createSecondAccount : t.createFirstAccount}
        </Button>
      </Card>
    );
  return (
    <div className="space-y-4">
      <FinanceTransferEditor
        key={editing?.id ?? "create-transfer"}
        botId={botId}
        accounts={activeAccounts}
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
            {activeAccounts.map((item) => (
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
          <LoadingState text={t.loading} context="transfers" />
        ) : history.isError ? (
          <div className="space-y-3">
            <ErrorState text={t.transferLoadError} context="transfers" />
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
          <EmptyState text={t.noTransfers} context="transfers" />
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
  const t = financeTransfersCopy(locale);
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
