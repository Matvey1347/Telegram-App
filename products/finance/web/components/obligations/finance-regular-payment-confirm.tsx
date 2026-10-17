"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ConsumerFinanceRegularPayment,
  ConsumerFinanceRegularPaymentConfirmation,
} from "@telegram-system/shared";
import {
  Button,
  DateInput,
  ErrorState,
  FormField,
  Input,
  Modal,
  Select,
} from "@consumer-finance/web/components/ui";
import { consumerFinanceObligationsApi } from "@consumer-finance/web/lib/api/consumer-finance-obligations-api";
import { consumerFinanceLedgerApi } from "@consumer-finance/web/lib/api/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeRegularPaymentsCopy } from "@consumer-finance/web/components/i18n/regular-payments";
import {
  financeOccurredAtForDate,
  financeToday,
} from "@consumer-finance/web/lib/formatters/consumer-finance-date";
import { localizeFinanceCategory } from "@consumer-finance/web/components/catalog/finance-category-i18n";
import { IconPicker } from "@consumer-finance/web/components/ui/finance-icon-picker";
import { financeAccountSelectEmoji } from "@consumer-finance/web/components/accounts/finance-account-select-icon";

export function FinanceRegularPaymentConfirm({
  botId,
  payment,
  expectedOccurrenceAt,
  expectedVersion,
  isEarlyPayment,
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
  isEarlyPayment: boolean;
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
  const [preserveSchedule, setPreserveSchedule] = useState(isEarlyPayment);
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
          : (payment.iconPresentation?.value ?? null))
          ? { emoji: iconSource }
          : {}),
        ...(occurredAt !== financeToday(timezone)
          ? { occurredAt: financeOccurredAtForDate(occurredAt, timezone) }
          : {}),
        ...(preserveSchedule ? { preserveSchedule: true } : {}),
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
            <Select
              uiLocale={locale}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {activeAccounts.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  data-icon-emoji={financeAccountSelectEmoji(item)}
                  data-option-meta={item.currency}
                >
                  {item.name}
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
            <DateInput
              lang={locale}
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </FormField>
          {isEarlyPayment ? (
            <div className="col-span-2 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2">
              <div className="flex min-h-10 items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t.preserveSchedule}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {t.preserveScheduleHelp}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={preserveSchedule}
                  aria-label={t.preserveSchedule}
                  onClick={() => setPreserveSchedule((value) => !value)}
                  className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${preserveSchedule ? "border-sky-400 bg-sky-500" : "border-neutral-600 bg-neutral-700"}`}
                >
                  <span
                    className={`absolute left-1 top-1 size-6 rounded-full bg-white shadow-md transition-transform ${preserveSchedule ? "translate-x-6" : "translate-x-0"}`}
                  />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="cancel" disabled={confirm.isPending} onClick={onClose}>
          {t.cancel}
        </Button>
        <Button
          disabled={confirm.isPending || !account || !(Number(amount) > 0)}
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
