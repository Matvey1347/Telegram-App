"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ConsumerFinanceAccount } from "@telegram-system/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "./ui";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { patchConsumerFinanceAccountCache } from "@/lib/features/finance/consumer-finance-cache";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { type FinanceLocale } from "./i18n/core";
import { financeAccountsCopy } from "./i18n/accounts";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { IconAvatar } from "./ui/finance-icon-avatar";

export function FinanceAccountsScreen({
  botId,
  locale,
  onEdit,
}: {
  botId: string;
  locale: FinanceLocale;
  onEdit: (accountId: string) => void;
}) {
  const t = financeAccountsCopy(locale);
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
  });
  if (accounts.isLoading) return <LoadingState text={t.loadingReferences} />;
  if (accounts.isError)
    return (
      <div className="space-y-3">
        <ErrorState text={t.referencesUnavailable} />
        <Button onClick={() => accounts.refetch()}>{t.retry}</Button>
      </div>
    );
  return (
    <FinanceAccounts
      botId={botId}
      accounts={accounts.data ?? []}
      locale={locale}
      onEdit={onEdit}
    />
  );
}

export function FinanceAccounts({
  botId,
  accounts,
  locale,
  onEdit,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  locale: FinanceLocale;
  onEdit: (accountId: string) => void;
}) {
  const client = useQueryClient();
  const t = financeAccountsCopy(locale);
  const [archiving, setArchiving] = useState<ConsumerFinanceAccount | null>(
    null,
  );
  const archive = useMutation({
    mutationFn: (id: string) =>
      consumerFinanceLedgerApi.archiveAccount(botId, id),
    onSuccess: (account) => {
      patchConsumerFinanceAccountCache(client, botId, account);
      void Promise.all([
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.dashboard(botId),
        }),
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.analyticsRoot(botId),
        }),
      ]);
      setArchiving(null);
    },
  });
  const active = accounts.filter((account) => !account.archivedAt);
  const archived = accounts.filter((account) => account.archivedAt);

  return (
    <div className="space-y-4">
      <Button
        className="min-h-10 self-start px-3"
        onClick={() => onEdit("create")}
      >
        <Plus size={16} aria-hidden="true" />
        {t.addAccount}
      </Button>
      {active.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {active.map((account) => (
            <Card
              key={account.id}
              className="flex items-center justify-between gap-3"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                onClick={() => onEdit(account.id)}
              >
                <IconAvatar
                  icon={account.iconPresentation}
                  label={account.name}
                  size="sm"
                  bordered={false}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {account.name}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {
                      t[
                        account.type.toLowerCase() as
                          | "cash"
                          | "card"
                          | "savings"
                          | "other"
                      ]
                    }{" "}
                    · {account.currency}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <strong className="block">
                    {formatMoney(account.balance, account.currency, "symbol")}
                  </strong>
                  {account.equivalentBalance &&
                  account.equivalentBalance.currency !== account.currency ? (
                    <span className="block text-xs text-neutral-500">
                      ≈{" "}
                      {formatMoney(
                        account.equivalentBalance.amount,
                        account.equivalentBalance.currency,
                        "symbol",
                      )}
                    </span>
                  ) : null}
                </span>
              </button>
              <div className="flex shrink-0 items-center">
                <button
                  aria-label={`${t.editAccount}: ${account.name}`}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => onEdit(account.id)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={`${t.archiveAccount}: ${account.name}`}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => setArchiving(account)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState text={t.noAccounts} />
      )}
      {archived.length ? (
        <Card>
          <h2 className="font-medium">{t.archivedAccounts}</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {t.archivedAccountsHelp}
          </p>
          <div className="mt-3 divide-y divide-neutral-800">
            {archived.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 py-2 text-sm text-neutral-400"
              >
                <span className="truncate">
                  {account.name} · {account.currency}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(account.balance, account.currency, "symbol")}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {archive.isError ? (
        <p className="text-sm text-rose-300">{t.accountArchiveError}</p>
      ) : null}
      <FinanceConfirmModal
        open={!!archiving}
        locale={locale}
        onClose={() => setArchiving(null)}
        onConfirm={() =>
          archiving ? archive.mutateAsync(archiving.id) : Promise.resolve()
        }
        entityName={archiving?.name ?? ""}
        actionLabel={t.archive}
        description={t.archiveAccountDescription}
      />
    </div>
  );
}
