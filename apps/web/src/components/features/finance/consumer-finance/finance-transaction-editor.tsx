"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceTransaction,
  ConsumerFinanceTransactionInput,
} from "@telegram-system/shared";
import { Button, DateInput, FormField, Input, Modal, Select } from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import {
  financeCalendarDate,
  financeOccurredAtForDate,
  financeToday,
} from "@/lib/features/finance/consumer-finance-date";
import { type FinanceLocale } from "./i18n/core";
import { financeTransactionsCopy } from "./i18n/transactions";
import { localizeFinanceCategory } from "./finance-category-i18n";

export function FinanceTransactionEditor({
  botId,
  accounts,
  categories,
  editing,
  locale,
  timezone,
  onClose,
  onSaved,
  initiallyOpenType = null,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  editing: ConsumerFinanceTransaction | null;
  locale: FinanceLocale;
  timezone: string;
  onClose: () => void;
  onSaved: (item: ConsumerFinanceTransaction) => void;
  initiallyOpenType?: ConsumerFinanceTransactionInput["type"] | null;
}) {
  const t = financeTransactionsCopy(locale);
  const [open, setOpen] = useState(!!initiallyOpenType);
  const [type, setType] = useState<ConsumerFinanceTransactionInput["type"]>(
    editing?.type ?? initiallyOpenType ?? "EXPENSE",
  );
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [accountId, setAccountId] = useState(editing?.accountId ?? "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [occurredAt, setOccurredAt] = useState(
    editing
      ? financeCalendarDate(editing.occurredAt, timezone)
      : financeToday(timezone),
  );
  const activeAccounts = accounts.filter(
    (item) => !item.archivedAt || item.id === accountId,
  );
  const account =
    activeAccounts.find((item) => item.id === accountId) ?? activeAccounts[0];
  const visibleCategories = categories.filter(
    (item) =>
      (item.type === type && !item.archivedAt) || item.id === categoryId,
  );
  const valid = !!account && Number(amount) > 0 && !!occurredAt;
  const mutation = useMutation({
    mutationFn: () => {
      const payload: ConsumerFinanceTransactionInput = {
        accountId: accountId || account?.id || "",
        categoryId: categoryId || undefined,
        type,
        amount,
        description: description.trim() || undefined,
        occurredAt: financeOccurredAtForDate(
          occurredAt,
          timezone,
          editing?.occurredAt,
        ),
      };
      return editing
        ? consumerFinanceApi.updateTransaction(botId, editing.id, payload)
        : consumerFinanceApi.createTransaction(botId, payload);
    },
    onSuccess: (item) => {
      onSaved(item);
      setOpen(false);
      if (!editing) {
        setAmount("");
        setDescription("");
        setCategoryId("");
        setOccurredAt(financeToday(timezone));
      }
    },
  });
  return (
    <Modal
      open={open || !!editing}
      closeLabel={t.close}
      onClose={() => {
        setOpen(false);
        onClose();
      }}
      title={editing ? t.editTransaction : t.addTransaction}
    >
      <div className="space-y-3">
        <FormField label={t.transactionType}>
          <Select
            uiLocale={locale}
            value={type}
            onChange={(event) => {
              setType(event.target.value as typeof type);
              setCategoryId("");
            }}
          >
            <option value="EXPENSE">{t.expense}</option>
            <option value="INCOME">{t.income}</option>
          </Select>
        </FormField>
        <FormField
          label={`${t.amount}${account ? ` (${account.currency})` : ""}`}
        >
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </FormField>
        <FormField label={t.account}>
          <Select
            uiLocale={locale}
            value={accountId || account?.id || ""}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {activeAccounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.iconPresentation.type === "unicode"
                  ? `${item.iconPresentation.value} `
                  : ""}
                {item.name} · {item.currency}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t.category}>
          <Select
            uiLocale={locale}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">{t.uncategorized}</option>
            {visibleCategories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.iconPresentation.type === "unicode"
                  ? `${item.iconPresentation.value} `
                  : ""}
                {localizeFinanceCategory(item.name, item.key, locale)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t.date}>
          <DateInput
            lang={locale}
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </FormField>
        <FormField label={t.description}>
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        <Button
          className="w-full"
          disabled={!valid || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? t.saving : t.saveTransaction}
        </Button>
        {mutation.isError ? (
          <p className="text-sm text-rose-300">{t.transactionSaveError}</p>
        ) : null}
      </div>
    </Modal>
  );
}
