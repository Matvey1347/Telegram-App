"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ConsumerFinanceRegularPayment,
  ConsumerFinanceRegularPaymentRecurrence,
  ConsumerFinanceExpenseNecessity,
} from "@telegram-system/shared";
import {
  Button,
  DateInput,
  ErrorState,
  FinanceNecessityToggle,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  Textarea,
} from "./ui";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinanceObligationsApi } from "@/lib/features/finance/consumer-finance-obligations-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { financeCalendarDate } from "@/lib/features/finance/consumer-finance-date";
import { localizeFinanceCategory } from "./finance-category-i18n";
import type { FinanceLocale } from "./i18n/core";
import { financeRegularPaymentsCopy } from "./i18n/regular-payments";
import { IconPicker } from "./ui/finance-icon-picker";

export function FinanceRegularPaymentEditor({
  botId,
  editing,
  locale,
  onClose,
  onSaved,
}: {
  botId: string;
  editing: ConsumerFinanceRegularPayment | null;
  locale: FinanceLocale;
  timezone: string;
  onClose: () => void;
  onSaved: (payment: ConsumerFinanceRegularPayment) => void;
}) {
  const t = financeRegularPaymentsCopy(locale);
  // Both references are independent and start once when this editor mounts.
  const accounts = useQuery({
    queryKey: consumerFinanceKeys.accounts(botId),
    queryFn: () => consumerFinanceLedgerApi.accounts(botId),
  });
  const categories = useQuery({
    queryKey: consumerFinanceKeys.categories(botId),
    queryFn: () => consumerFinanceLedgerApi.categories(botId),
  });
  const [name, setName] = useState(editing?.name ?? "");
  const [iconSource, setIconSource] = useState<string | null>(
    editing?.iconPresentation?.type === "image"
      ? `image:${editing.iconPresentation.url}`
      : (editing?.iconPresentation?.value ?? "🔁"),
  );
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [accountId, setAccountId] = useState(editing?.accountId ?? "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [recurrence, setRecurrence] =
    useState<ConsumerFinanceRegularPaymentRecurrence>(
      editing?.recurrence ?? "MONTHLY",
    );
  const [intervalCount, setIntervalCount] = useState(
    String(editing?.intervalCount ?? 1),
  );
  const [nextPaymentDate, setNextPaymentDate] = useState(
    editing
      ? financeCalendarDate(editing.nextOccurrenceAt, editing.scheduleTimezone)
      : "",
  );
  const [note, setNote] = useState(editing?.note ?? "");
  const [necessity, setNecessity] = useState<ConsumerFinanceExpenseNecessity>(
    editing?.necessity ?? "DISCRETIONARY",
  );
  const accountRows = (accounts.data ?? []).filter(
    (account) => !account.archivedAt || account.id === editing?.accountId,
  );
  const categoryRows = (categories.data ?? []).filter(
    (category) =>
      category.type === "EXPENSE" &&
      (!category.archivedAt || category.id === editing?.categoryId),
  );
  const selectedAccountId =
    accountId && accountRows.some((account) => account.id === accountId)
      ? accountId
      : (accountRows[0]?.id ?? "");
  const save = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        emoji: iconSource,
        amount,
        accountId: selectedAccountId,
        categoryId: categoryId || null,
        recurrence,
        intervalCount: Number(intervalCount),
        nextPaymentDate,
        note: note.trim() || null,
        ...(necessity !== "UNSPECIFIED" ? { necessity } : {}),
      };
      return editing
        ? consumerFinanceObligationsApi.updateRegularPayment(
            botId,
            editing.id,
            input,
          )
        : consumerFinanceObligationsApi.createRegularPayment(botId, input);
    },
    onSuccess: (saved) => onSaved(saved),
  });
  if (accounts.isLoading || categories.isLoading)
    return <LoadingState text={t.loadingReferences} />;
  if (accounts.isError || categories.isError)
    return (
      <div className="space-y-3">
        <ErrorState text={t.referenceLoadError} />
        <Button
          onClick={() =>
            void Promise.all([accounts.refetch(), categories.refetch()])
          }
        >
          {t.retry}
        </Button>
      </div>
    );
  const valid =
    !!name.trim() &&
    Number(amount) > 0 &&
    Number.isInteger(Number(intervalCount)) &&
    Number(intervalCount) >= 1 &&
    Number(intervalCount) <= 3650 &&
    !!selectedAccountId &&
    /^\d{4}-\d{2}-\d{2}$/.test(nextPaymentDate);
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t.close}
      title={editing ? t.editRegularPayment : t.addRegularPayment}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <IconPicker
            botId={botId}
            uiLocale={locale}
            source={iconSource}
            onChange={setIconSource}
            buttonLabel={name.trim() || t.paymentName}
          />
        </div>
        <FormField label={t.paymentName}>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField label={t.amount}>
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </FormField>
        <FormField label={t.account}>
          <Select
            uiLocale={locale}
            value={selectedAccountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {accountRows.map((account) => (
              <option
                key={account.id}
                value={account.id}
                data-option-meta={account.currency}
                data-icon-emoji={
                  account.iconPresentation.type === "unicode"
                    ? account.iconPresentation.value
                    : undefined
                }
              >
                {account.name}
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
            {categoryRows.map((category) => (
              <option
                key={category.id}
                value={category.id}
                data-icon-emoji={
                  category.iconPresentation.type === "unicode"
                    ? category.iconPresentation.value
                    : undefined
                }
              >
                {localizeFinanceCategory(category.name, category.key, locale)}
              </option>
            ))}
          </Select>
        </FormField>
        <FinanceNecessityToggle
          value={necessity}
          locale={locale}
          onChange={setNecessity}
          className="sm:col-span-2"
        />
        <FormField label={t.intervalCount}>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
            <Input
              type="number"
              min={1}
              max={3650}
              inputMode="numeric"
              value={intervalCount}
              onChange={(event) => setIntervalCount(event.target.value)}
            />
            <Select
              uiLocale={locale}
              value={recurrence}
              onChange={(event) =>
                setRecurrence(
                  event.target.value as ConsumerFinanceRegularPaymentRecurrence,
                )
              }
            >
              <option value="DAILY">{t.unitDay}</option>
              <option value="WEEKLY">{t.unitWeek}</option>
              <option value="MONTHLY">{t.unitMonth}</option>
              <option value="YEARLY">{t.unitYear}</option>
            </Select>
          </div>
        </FormField>
        <FormField label={t.nextPaymentDate}>
          <DateInput
            lang={locale}
            value={nextPaymentDate}
            onChange={(event) => setNextPaymentDate(event.target.value)}
          />
        </FormField>
        <FormField label={t.note} className="sm:col-span-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
        <Button
          className="w-full sm:col-span-2"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? t.saving : t.save}
        </Button>
        {save.isError ? (
          <div className="sm:col-span-2">
            <ErrorState text={t.paymentSaveError} />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
