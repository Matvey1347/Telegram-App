"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceAccountType,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Select,
} from "./ui";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { patchConsumerFinanceAccountCache } from "@/lib/features/finance/consumer-finance-cache";
import { type FinanceLocale } from "./i18n/core";
import { financeAccountsCopy } from "./i18n/accounts";
import { IconPicker } from "./ui/finance-icon-picker";
import { FinanceCurrencySelect } from "./ui/finance-currency-select";

const TYPES: ConsumerFinanceAccountType[] = [
  "CASH",
  "CARD",
  "SAVINGS",
  "OTHER",
];

export function FinanceAccountEditorScreen({
  botId,
  defaultCurrency,
  locale,
  accountId,
  onBack,
}: {
  botId: string;
  defaultCurrency: string;
  locale: FinanceLocale;
  accountId: string;
  onBack: () => void;
}) {
  const t = financeAccountsCopy(locale);
  const creating = accountId === "create";
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
    enabled: !creating,
  });
  if (!creating && accounts.isLoading)
    return <LoadingState text={t.loadingReferences} />;
  if (!creating && accounts.isError)
    return (
      <div className="space-y-3">
        <ErrorState text={t.referencesUnavailable} />
        <Button onClick={() => accounts.refetch()}>{t.retry}</Button>
      </div>
    );
  const account = accounts.data?.find((item) => item.id === accountId);
  if (!creating && !account)
    return (
      <Card className="space-y-3">
        <ErrorState text={t.referencesUnavailable} />
        <Button variant="secondary" onClick={onBack}>
          {t.accounts}
        </Button>
      </Card>
    );
  return (
    <FinanceAccountEditor
      botId={botId}
      defaultCurrency={defaultCurrency}
      locale={locale}
      account={account}
      creating={creating}
      onBack={onBack}
    />
  );
}

export function FinanceAccountEditor({
  botId,
  defaultCurrency,
  locale,
  account,
  creating,
  onBack,
}: {
  botId: string;
  defaultCurrency: string;
  locale: FinanceLocale;
  account?: ConsumerFinanceAccount;
  creating: boolean;
  onBack: () => void;
}) {
  const t = financeAccountsCopy(locale);
  const client = useQueryClient();
  const [name, setName] = useState(account?.name ?? "");
  const [currency, setCurrency] = useState(
    account?.currency ?? defaultCurrency,
  );
  const [openingBalance, setOpeningBalance] = useState(
    account?.openingBalance ?? "0",
  );
  const [type, setType] = useState<ConsumerFinanceAccountType>(
    account?.type ?? "CARD",
  );
  const [emoji, setEmoji] = useState<string | undefined>(
    account?.iconPresentation.type === "unicode"
      ? account.iconPresentation.value
      : creating
        ? "💳"
        : undefined,
  );
  const mutation = useMutation({
    mutationFn: () =>
      creating
        ? consumerFinanceLedgerApi.createAccount(botId, {
            name: name.trim(),
            emoji,
            type,
            currency,
            openingBalance,
          })
        : consumerFinanceLedgerApi.updateAccount(botId, account!.id, {
            name: name.trim(),
            type,
            ...(emoji === undefined ? {} : { emoji }),
          }),
    onSuccess: (saved) => {
      patchConsumerFinanceAccountCache(client, botId, saved);
      const derivedInvalidations = [
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.dashboard(botId),
        }),
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.analyticsRoot(botId),
        }),
      ];
      if (!creating) {
        derivedInvalidations.push(
          client.invalidateQueries({
            queryKey: consumerFinanceKeys.transactionLists(botId),
          }),
          client.invalidateQueries({
            queryKey: consumerFinanceKeys.transferLists(botId),
          }),
        );
      }
      void Promise.all(derivedInvalidations);
      onBack();
    },
  });

  return (
    <div className="space-y-4">
      <Button variant="secondary" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t.accounts}
      </Button>
      <Card className="mx-auto max-w-2xl">
        <h2 className="text-lg font-semibold">
          {creating ? t.addAccount : t.editAccount}
        </h2>
        <div className="mt-4 space-y-3">
          <IconPicker
            uiLocale={locale}
            icon={
              emoji
                ? { type: "unicode", value: emoji }
                : (account?.iconPresentation ?? {
                    type: "unicode",
                    value: "💳",
                  })
            }
            iconId={null}
            onChange={() => undefined}
            onEmojiChange={(value) => value && setEmoji(value)}
            allowImages={false}
            buttonLabel={t.accountName}
          />
          <FormField label={t.accountName}>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField label={t.accountType}>
            <Select
              uiLocale={locale}
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
          <FormField label={t.currency}>
            {creating ? (
              <FinanceCurrencySelect
                value={currency}
                onChange={setCurrency}
                locale={locale}
              />
            ) : (
              <Input value={currency} readOnly aria-readonly="true" />
            )}
          </FormField>
          {creating ? (
            <>
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
      </Card>
    </div>
  );
}
