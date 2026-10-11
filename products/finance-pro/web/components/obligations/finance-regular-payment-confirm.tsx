"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ConsumerFinanceRegularPayment,
  ConsumerFinanceRegularPaymentConfirmation,
} from "@telegram-system/shared";
import { Button, DateInput, ErrorState, FormField, Input, Modal, Select } from "@finance-pro/web/components/ui";
import { consumerFinanceObligationsApi } from "@finance-pro/web/lib/api/consumer-finance-obligations-api";
import { consumerFinanceLedgerApi } from "@finance-pro/web/lib/api/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@finance-pro/web/lib/query/consumer-finance-query-keys";
import type { FinanceLocale } from "@finance-pro/web/components/i18n/core";
import { financeRegularPaymentsCopy } from "@finance-pro/web/components/i18n/regular-payments";
import { financeOccurredAtForDate, financeToday } from "@finance-pro/web/lib/formatters/consumer-finance-date";
import { localizeFinanceCategory } from "@finance-pro/web/components/catalog/finance-category-i18n";
import { IconPicker } from "@finance-pro/web/components/ui/finance-icon-picker";

export function FinanceRegularPaymentConfirm({
  botId,
  payment,
  expectedOccurrenceAt,
  expectedVersion,
  customAmount,
  locale,
  timezone,
  onClose,
  onConfirmed,
  onApplied,
}: {
  botId: string;
  payment: ConsumerFinanceRegularPayment;
  expectedOccurrenceAt: string;
  expectedVersion: number;
  customAmount: boolean;
  locale: FinanceLocale;
  timezone: string;
  onClose: () => void;
  onConfirmed: (result: ConsumerFinanceRegularPaymentConfirmation) => void;
  onApplied: (payment: ConsumerFinanceRegularPayment) => void;
}) {
  const t = financeRegularPaymentsCopy(locale);
  const [amount, setAmount] = useState(payment.amount);
  const [accountId, setAccountId] = useState(payment.accountId);
  const [categoryId, setCategoryId] = useState(payment.categoryId ?? "");
  const [description, setDescription] = useState(payment.name);
  const [iconSource, setIconSource] = useState<string | null>(() => {
    const icon = payment.iconPresentation;
    if (!icon) return null;
    return icon.type === "image" ? `image:${icon.url}` : icon.value;
  });
  const [occurredAt, setOccurredAt] = useState(financeToday(timezone));
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
  });
  const categories = useQuery({
    queryKey: consumerFinanceKeys.categories(botId),
    queryFn: () => consumerFinanceLedgerApi.categories(botId),
  });
  const activeAccounts = accounts.data
    ? accounts.data.filter((account) => !account.archivedAt)
    : [{ ...payment.account, archivedAt: null }];
  const account = activeAccounts.find((item) => item.id === accountId);
  const visibleCategories = (categories.data ?? []).filter(
    (category) => category.type === "EXPENSE" && !category.archivedAt,
  );
  const [confirmation, setConfirmation] =
    useState<ConsumerFinanceRegularPaymentConfirmation | null>(null);
  const confirm = useMutation({
    mutationFn: () =>
      consumerFinanceObligationsApi.confirmRegularPayment(botId, payment.id, {
        expectedOccurrenceAt,
        expectedVersion,
        amount,
        ...(accountId !== payment.accountId ? { accountId } : {}),
        ...(categoryId !== (payment.categoryId ?? "")
          ? { categoryId: categoryId || null }
          : {}),
        ...(description.trim() !== payment.name
          ? { description: description.trim() || undefined }
          : {}),
        ...(iconSource !==
        (payment.iconPresentation?.type === "image"
          ? `image:${payment.iconPresentation.url}`
          : payment.iconPresentation?.value ?? null)
          ? { emoji: iconSource }
          : {}),
        ...(occurredAt !== financeToday(timezone)
          ? { occurredAt: financeOccurredAtForDate(occurredAt, timezone) }
          : {}),
      }),
    onSuccess: (result) => {
      onConfirmed(result);
      if (result.futureAmountUpdateRequired) setConfirmation(result);
      else onClose();
    },
  });
  const apply = useMutation({
    mutationFn: () =>
      consumerFinanceObligationsApi.applyOccurrenceAmount(
        botId,
        payment.id,
        confirmation!.occurrence.id,
        { expectedVersion: confirmation!.regularPayment.version },
      ),
    onSuccess: (updated) => {
      onApplied(updated);
      onClose();
    },
  });
  if (confirmation)
    return (
      <Modal
        open
        onClose={apply.isPending ? () => undefined : onClose}
        closeLabel={t.close}
        title={t.applyAmountQuestion}
      >
        <p className="text-sm text-neutral-300">{t.applyAmountQuestion}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            disabled={apply.isPending}
            onClick={onClose}
          >
            {t.noKeep}
          </Button>
          <Button disabled={apply.isPending} onClick={() => apply.mutate()}>
            {t.yesApply}
          </Button>
        </div>
        {apply.isError ? (
          <div className="mt-3">
            <ErrorState text={t.actionError} />
          </div>
        ) : null}
      </Modal>
    );
  return (
    <Modal
      open
      onClose={confirm.isPending ? () => undefined : onClose}
      closeLabel={t.close}
      title={t.confirmPayment}
    >
      <p className="text-sm text-neutral-300">{t.confirmTransactionHelp}</p>
      {accounts.isError || categories.isError ? (
        <ErrorState text={t.referenceLoadError} />
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <FormField label={t.paidAmount} required>
            <Input
              autoFocus
              inputMode="decimal"
              suffix={account?.currency}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </FormField>
          <FormField label={t.account} required>
            <Select uiLocale={locale} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {activeAccounts.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  data-icon-emoji={
                    item.iconPresentation.type === "unicode"
                      ? item.iconPresentation.value
                      : undefined
                  }
                  data-option-meta={item.currency}
                >
                  {item.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t.category}>
            <Select uiLocale={locale} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">{t.noCategory}</option>
              {visibleCategories.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  data-icon-emoji={
                    item.iconPresentation.type === "unicode"
                      ? item.iconPresentation.value
                      : undefined
                  }
                >
                  {localizeFinanceCategory(item.name, item.key, locale)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t.paymentName} required>
            <div className="relative">
              <IconPicker
                botId={botId}
                uiLocale={locale}
                source={iconSource}
                onChange={setIconSource}
                ariaLabel={t.paymentName}
                bare
                className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md hover:bg-neutral-800"
              />
              <Input
                className="pl-10"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </FormField>
          <FormField label={t.paymentDate} required className="col-span-2">
            <DateInput lang={locale} value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
          </FormField>
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="cancel" disabled={confirm.isPending} onClick={onClose}>
          {t.cancel}
        </Button>
        <Button
          disabled={
            confirm.isPending || !account || !(Number(amount) > 0)
          }
          onClick={() => confirm.mutate()}
        >
          {t.confirmPayment}
        </Button>
      </div>
      {confirm.isError ? (
        <div className="mt-3">
          <ErrorState text={t.actionError} />
        </div>
      ) : null}
    </Modal>
  );
}
