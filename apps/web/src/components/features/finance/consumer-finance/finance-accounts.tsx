"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceAccountType,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { formatMoney } from "@/lib/features/finance/money";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { financeCopy, type FinanceLocale } from "./finance-i18n";
import { FinanceConfirmModal } from "./finance-confirm-modal";

const TYPES: ConsumerFinanceAccountType[] = [
  "CASH",
  "CARD",
  "SAVINGS",
  "OTHER",
];

export function FinanceAccounts({
  botId,
  accounts,
  defaultCurrency,
  locale,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  defaultCurrency: string;
  locale: FinanceLocale;
}) {
  const client = useQueryClient();
  const t = financeCopy(locale);
  const [editing, setEditing] = useState<ConsumerFinanceAccount | null>(null);
  const [archiving, setArchiving] = useState<ConsumerFinanceAccount | null>(
    null,
  );
  const patchAccount = (account: ConsumerFinanceAccount) =>
    client.setQueryData(
      consumerFinanceKeys.accounts(botId),
      (rows: ConsumerFinanceAccount[] | undefined) => {
        const current = rows ?? [];
        return current.some((row) => row.id === account.id)
          ? current.map((row) => (row.id === account.id ? account : row))
          : [...current, account];
      },
    );
  const archive = useMutation({
    mutationFn: (id: string) => consumerFinanceApi.archiveAccount(botId, id),
    onSuccess: (account) => {
      patchAccount(account);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.analyticsRoot(botId),
      });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.ultimateRoot(botId),
      });
      setArchiving(null);
    },
  });
  return (
    <div className="space-y-4">
      <AccountEditor
        key={editing?.id ?? "create-account"}
        botId={botId}
        defaultCurrency={defaultCurrency}
        locale={locale}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(account) => {
          patchAccount(account);
          setEditing(null);
          void client.invalidateQueries({
            queryKey: consumerFinanceKeys.dashboard(botId),
          });
          // History rows embed account summaries, so a rename must refresh them.
          void client.invalidateQueries({
            queryKey: consumerFinanceKeys.transactionLists(botId),
          });
          void client.invalidateQueries({
            queryKey: consumerFinanceKeys.transferLists(botId),
          });
          void client.invalidateQueries({
            queryKey: consumerFinanceKeys.ultimateRoot(botId),
          });
        }}
      />
      {accounts.filter((account) => !account.archivedAt).length ? (
        accounts
          .filter((account) => !account.archivedAt)
          .map((account) => (
            <Card
              key={account.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{account.name}</p>
                <p className="text-xs text-neutral-500">
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
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <div className="mr-1 text-right">
                  <strong>
                    {formatMoney(account.balance, account.currency, "symbol")}
                  </strong>
                  {account.equivalentBalance &&
                  account.equivalentBalance.currency !== account.currency ? (
                    <p className="text-xs text-neutral-500">
                      ≈{" "}
                      {formatMoney(
                        account.equivalentBalance.amount,
                        account.equivalentBalance.currency,
                        "symbol",
                      )}
                    </p>
                  ) : null}
                </div>
                <button
                  aria-label={`${t.editAccount}: ${account.name}`}
                  className="rounded p-2 text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => setEditing(account)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  aria-label={`${t.archiveAccount}: ${account.name}`}
                  className="rounded p-2 text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                  onClick={() => setArchiving(account)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))
      ) : (
        <EmptyState text={t.noAccounts} />
      )}
      {accounts.some((account) => account.archivedAt) ? (
        <Card>
          <h2 className="font-medium">{t.archivedAccounts}</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {t.archivedAccountsHelp}
          </p>
          <div className="mt-3 divide-y divide-neutral-800">
            {accounts
              .filter((account) => account.archivedAt)
              .map((account) => (
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

function AccountEditor({
  botId,
  defaultCurrency,
  locale,
  editing,
  onClose,
  onSaved,
}: {
  botId: string;
  defaultCurrency: string;
  locale: FinanceLocale;
  editing: ConsumerFinanceAccount | null;
  onClose: () => void;
  onSaved: (account: ConsumerFinanceAccount) => void;
}) {
  const t = financeCopy(locale);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(editing?.name ?? "");
  const [currency, setCurrency] = useState(
    editing?.currency ?? defaultCurrency,
  );
  const [openingBalance, setOpeningBalance] = useState(
    editing?.openingBalance ?? "0",
  );
  const [type, setType] = useState<ConsumerFinanceAccountType>(
    editing?.type ?? "CARD",
  );
  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? consumerFinanceApi.updateAccount(botId, editing.id, {
            name: name.trim(),
            type,
          })
        : consumerFinanceApi.createAccount(botId, {
            name: name.trim(),
            type,
            currency,
            openingBalance,
          }),
    onSuccess: (account) => {
      onSaved(account);
      setOpen(false);
      setName("");
      setCurrency(defaultCurrency);
      setOpeningBalance("0");
    },
  });
  const visible = open || !!editing;
  return (
    <>
      <Button
        className="w-full"
        onClick={() => {
          setName("");
          setType("CARD");
          setCurrency(defaultCurrency);
          setOpeningBalance("0");
          setOpen(true);
        }}
      >
        {t.addAccount}
      </Button>
      <Modal
        open={visible}
        closeLabel={t.close}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title={editing ? t.editAccount : t.addAccount}
      >
        <div className="space-y-3">
          <FormField label={t.accountName}>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField label={t.accountType}>
            <Select
              value={type}
              onChange={(event) =>
                setType(event.target.value as ConsumerFinanceAccountType)
              }
            >
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {
                    t[
                      value.toLowerCase() as
                        | "cash"
                        | "card"
                        | "savings"
                        | "other"
                    ]
                  }
                </option>
              ))}
            </Select>
          </FormField>
          {!editing ? (
            <>
              <FormField label={t.currency}>
                <Input
                  value={currency}
                  maxLength={3}
                  onChange={(event) =>
                    setCurrency(event.target.value.toUpperCase())
                  }
                />
              </FormField>
              <FormField label={t.openingBalance}>
                <Input
                  inputMode="decimal"
                  value={openingBalance}
                  onChange={(event) => setOpeningBalance(event.target.value)}
                />
              </FormField>
            </>
          ) : null}
          <Button
            className="w-full"
            disabled={
              !name.trim() ||
              !currency.trim() ||
              !Number.isFinite(Number(openingBalance)) ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t.saving : t.save}
          </Button>
          {mutation.isError ? (
            <p className="text-sm text-rose-300">{t.accountSaveError}</p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
