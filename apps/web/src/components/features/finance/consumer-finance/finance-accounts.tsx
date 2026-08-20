"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Select,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { formatMoney } from "@/lib/features/finance/money";
import { consumerFinanceKeys } from "@/lib/query-keys";
export function FinanceAccounts({
  botId,
  accounts,
  defaultCurrency,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  defaultCurrency: string;
}) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [type, setType] = useState<ConsumerFinanceAccount["type"]>("CARD");
  const create = useMutation({
    mutationFn: () =>
      consumerFinanceApi.createAccount(botId, {
        name,
        currency,
        openingBalance,
        type,
      }),
    onSuccess: (account) => {
      client.setQueryData(
        consumerFinanceKeys.accounts(botId),
        (items: ConsumerFinanceAccount[] | undefined) => [
          ...(items ?? []),
          account,
        ],
      );
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
      setName("");
      setCurrency(defaultCurrency);
    },
  });
  const archive = useMutation({
    mutationFn: (id: string) =>
      consumerFinanceApi.archiveAccount(botId, id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: consumerFinanceKeys.accounts(botId) });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
    },
  });
  const active = accounts.filter((account) => !account.archivedAt);
  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Account name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Currency">
            <Input
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </FormField>
          <FormField label="Type">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {["CASH", "CARD", "SAVINGS", "OTHER"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Opening balance">
            <Input
              inputMode="decimal"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
            />
          </FormField>
        </div>
        <Button
          className="mt-3 w-full"
          disabled={!name || create.isPending}
          onClick={() => create.mutate()}
        >
          Add account
        </Button>
      </Card>
      {active.length ? (
        active.map((account) => (
          <Card key={account.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{account.name}</p>
              <p className="text-xs text-neutral-500">
                {account.type} · {account.currency}
              </p>
            </div>
            <div className="text-right">
              <strong>
                {formatMoney(account.balance, account.currency, "symbol")}
              </strong>
              {account.equivalentBalance &&
              account.equivalentBalance.currency !== account.currency ? (
                <p className="mt-1 text-xs text-neutral-500">
                  ≈ {formatMoney(
                    account.equivalentBalance.amount,
                    account.equivalentBalance.currency,
                    "symbol",
                  )}
                </p>
              ) : null}
              <button
                aria-label={`Archive ${account.name}`}
                disabled={archive.isPending}
                onClick={() => archive.mutate(account.id)}
                className="ml-3 text-xs text-rose-300"
              >
                Archive
              </button>
            </div>
          </Card>
        ))
      ) : (
        <EmptyState text="Create your first account." />
      )}
    </div>
  );
}
